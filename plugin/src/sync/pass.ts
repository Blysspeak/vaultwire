import type { DocId } from '@vaultwire/shared';
import { applyPlan } from '../engine/apply';
import type { ApplyReport, VaultGateway } from '../engine/apply';
import { decide } from '../engine/decide';
import { checkMassOperations } from '../engine/guards';
import { SyncQueue } from '../engine/queue';
import { scanConnection } from '../engine/scanner';
import type { ConflictRecord } from '../conflicts/registry-file';
import type { ConflictDeps } from '../conflicts/resolve';
import type { RingLog } from '../log';
import type { SyncConnection } from './connection';
import { preparePull } from './pull';
import type { PullOutcome } from './pull';
import type { ConflictPolicy } from './pull-conflict';
import { runPush } from './push';
import { fetchChanges } from './remote';
import type { TransferContext } from './transfer';
import { emptyReport } from './types';
import type { RunReport, SyncLimits, VaultReader } from './types';

/** Вход одного прогона. Пределы функцией: настройки правятся между прогонами. */
export interface PassDeps {
  readonly connection: SyncConnection;
  readonly reader: VaultReader;
  readonly gateway: VaultGateway;
  readonly limits: () => SyncLimits;
  readonly log: RingLog;
  readonly now: () => number;
  /** Автослияние markdown; не задано — стратегия merge уходит в конфликтную копию. */
  readonly merge?: ConflictDeps['merge'];
  /** Запись конфликта в реестр панели. */
  readonly onConflict?: (record: ConflictRecord) => Promise<void>;
}

/**
 * Последовательность раздела 6: локальный скан, догон changes, таблица решений,
 * порог массовых операций, применение, обновление индекса и курсора.
 */
export async function runPass(deps: PassDeps, at: number): Promise<RunReport> {
  const { connection, reader, gateway, log } = deps;
  const limits = deps.limits();
  const keys = connection.keys;
  if (keys === null) return emptyReport(connection.spaceId, at, connection.lastSeq, true);

  const pending = connection.drain();
  // Замеченное, но не отправленное переживает перезапуск: флаг dirty в индексе.
  for (const path of pending.paths) connection.index.markDirty(path, true);

  const local = scanConnection(reader.list(), connection.index.all(), {
    folder: connection.folder,
    include: connection.settings.include,
    exclude: connection.settings.exclude,
    maxFileBytes: connection.settings.maxFileBytes ?? limits.maxFileBytes,
  });
  const remote = await fetchChanges(connection.client, connection.spaceId, connection.lastSeq, keys);
  const docIds = await connection.resolveDocIds([
    ...local.created.map((file) => file.path),
    ...local.modified.map((file) => file.path),
    ...local.deleted,
    ...local.unchanged,
    ...pending.renames.map((hint) => hint.toPath),
  ]);

  const ops = decide({
    index: connection.index.all(),
    local,
    remote: remote.changes,
    renames: pending.renames,
    role: connection.role,
    docIdFor: (path: string): DocId => {
      const docId = docIds.get(path);
      if (docId === undefined) throw new Error(`vaultwire: docId не посчитан: ${path}`);
      return docId;
    },
  });

  const mass = checkMassOperations(ops, local.scanned, {
    absolute: limits.massDeleteAbsolute,
    ratio: limits.massDeleteRatio,
  });
  if (mass.confirmationRequired && !connection.takeMassAllowance()) {
    log.warn('sync', 'массовое удаление требует подтверждения', { count: mass.deletions });
    const stopped = emptyReport(connection.spaceId, at, connection.lastSeq, true);
    return { ...stopped, massCheck: mass, skipped: local.skipped };
  }

  const ctx: TransferContext = {
    spaceId: connection.spaceId,
    client: connection.client,
    keys,
    reader,
    index: connection.index,
    echo: connection.echo,
    folder: connection.folder,
    deviceLabel: limits.deviceLabel,
    now: deps.now,
  };
  const policy: ConflictPolicy = {
    strategy: connection.settings.conflictStrategy,
    readOnly: !connection.writable,
    deps: {
      exists: (path: string): boolean => gateway.getFile(path) !== null,
      ...(deps.merge === undefined ? {} : { merge: deps.merge }),
    },
  };
  const pull = await preparePull(ctx, ops, new SyncQueue({ concurrency: limits.concurrency }), policy);
  const applied = await applyPlan(gateway, pull.plan, { echo: connection.echo });
  commitPull(connection, pull, applied);
  for (const record of pull.records) await deps.onConflict?.(record);
  // Слияние и победившая локальная версия уезжают тем же прогоном, а не следующим.
  const push = await runPush(ctx, [...ops, ...pull.pushes], new SyncQueue({ concurrency: limits.concurrency }));

  connection.setLastSeq(remote.seq);
  await connection.index.flush();
  return {
    spaceId: connection.spaceId,
    at,
    pulled: applied.written,
    pushed: push.pushed,
    trashed: [...applied.trashed, ...push.deleted],
    conflicts: pull.conflicts,
    problems: [...pull.problems, ...push.problems],
    skipped: local.skipped,
    massCheck: null,
    lastSeq: remote.seq,
    idle: false,
  };
}

/** Индекс двигается только за реально изменившимся диском, а не за планом. */
function commitPull(connection: SyncConnection, pull: PullOutcome, applied: ApplyReport): void {
  const index = connection.index;
  for (const path of applied.written) {
    const entry = pull.commits.get(path);
    if (entry !== undefined) index.set(entry);
  }
  for (const path of [...applied.trashed, ...applied.missing]) {
    const relPath = pull.removals.get(path);
    if (relPath !== undefined) index.delete(relPath);
  }
  for (const relPath of pull.orphans) index.delete(relPath);
}
