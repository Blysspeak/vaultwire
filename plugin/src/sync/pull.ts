import type { ApplyPlan, WriteRequest } from '../engine/apply';
import type { ConflictOp, PullOp, PushOp, SyncOp } from '../engine/ops';
import type { ProblemDoc, QueueTask, SyncQueue } from '../engine/queue';
import type { IndexEntry, RemoteChange } from '../engine/types';
import type { ConflictRecord } from '../conflicts/registry-file';
import { vaultPath } from './paths';
import { planConflict } from './pull-conflict';
import type { ConflictPolicy } from './pull-conflict';
import { decodeBody, fetchBody } from './transfer';
import type { TransferContext } from './transfer';

export interface PullOutcome {
  readonly plan: ApplyPlan;
  /** Записи индекса по пути хранилища: ставятся только для реально записанных файлов. */
  readonly commits: ReadonlyMap<string, IndexEntry>;
  /** Путь хранилища — путь подключения, для чистки индекса после удаления. */
  readonly removals: ReadonlyMap<string, string>;
  /** Записи индекса без файла на диске: чистятся сразу, применять нечего. */
  readonly orphans: readonly string[];
  /** Слияние и победившая локальная версия: их отправляет тот же прогон. */
  readonly pushes: readonly PushOp[];
  readonly records: readonly ConflictRecord[];
  readonly conflicts: readonly string[];
  readonly problems: readonly ProblemDoc[];
}

/**
 * Приёмная половина прогона: тела скачиваются очередью с ограниченной
 * конкурентностью, а на диск ложатся одним планом, чтобы порядок «сначала
 * записи, потом удаления» задавался applyPlan, а не порядком ответов сервера.
 */
export async function preparePull(
  ctx: TransferContext,
  ops: readonly SyncOp[],
  queue: SyncQueue,
  policy: ConflictPolicy,
): Promise<PullOutcome> {
  const slots: Array<WriteRequest | null> = [];
  const commits = new Map<string, IndexEntry>();
  const removals = new Map<string, string>();
  const orphans: string[] = [];
  const pushes: PushOp[] = [];
  const records: ConflictRecord[] = [];
  const tasks: QueueTask[] = [];

  const reserve = (count: number): number => {
    const first = slots.length;
    for (let i = 0; i < count; i += 1) slots.push(null);
    return first;
  };

  for (const op of ops) {
    if (op.kind === 'pull') {
      const slot = reserve(1);
      tasks.push(task(op, async () => {
        const pulled = await download(ctx, op.path, op.remote);
        slots[slot] = pulled.write;
        commits.set(pulled.write.path, pulled.entry);
      }));
    } else if (op.kind === 'pullDelete') {
      removals.set(vaultPath(ctx.folder, op.path), op.path);
    } else if (op.kind === 'conflict') {
      // Копия и основной путь: две записи максимум, стратегия может дать меньше.
      const first = reserve(2);
      tasks.push(task(op, async () => {
        const plan = await planConflict(ctx, op, policy);
        plan.writes.forEach((write, i) => {
          slots[first + i] = write;
        });
        if (plan.entry !== null) commits.set(vaultPath(ctx.folder, op.path), plan.entry);
        if (plan.push !== null) pushes.push(plan.push);
        records.push(plan.record);
      }));
    } else if (op.kind === 'noop' && (op.reason === 'remote-deleted' || op.reason === 'both-deleted')) {
      orphans.push(op.path);
    }
  }

  const report = await queue.run(tasks);
  const writes = slots.filter((write): write is WriteRequest => write !== null);
  return {
    plan: { writes, trashes: [...removals.keys()] },
    commits,
    removals,
    orphans,
    pushes,
    records,
    conflicts: records
      .map((record) => record.copyPath)
      .filter((path): path is string => path !== null),
    problems: report.problems,
  };
}

function task(op: PullOp | ConflictOp, run: () => Promise<void>): QueueTask {
  return { id: op.docId, path: op.path, run };
}

interface Pulled {
  readonly write: WriteRequest;
  readonly entry: IndexEntry;
}

async function download(ctx: TransferContext, relPath: string, remote: RemoteChange): Promise<Pulled> {
  const body = await fetchBody(ctx, remote);
  const mtime = remote.mtime ?? ctx.now();
  const write: WriteRequest = {
    path: vaultPath(ctx.folder, relPath),
    data: decodeBody(relPath, body),
    mtime,
    ctime: remote.ctime ?? mtime,
  };
  const entry: IndexEntry = {
    path: relPath,
    docId: remote.docId,
    rev: remote.rev,
    plainHash: remote.plainHash ?? '',
    mtime,
    size: body.byteLength,
    syncedAt: ctx.now(),
    dirty: false,
    lastAuthor: remote.deviceLabel,
    lastDirection: 'pull',
  };
  return { write, entry };
}
