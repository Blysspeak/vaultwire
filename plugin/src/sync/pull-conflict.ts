import type { WriteRequest } from '../engine/apply';
import type { ConflictOp, PushOp } from '../engine/ops';
import type { IndexEntry } from '../engine/types';
import type { ConflictRecord } from '../conflicts/registry-file';
import { resolveReadOnly } from '../conflicts/ro-guard';
import { resolveConflict } from '../conflicts/resolve';
import type { ConflictDeps, ConflictSide } from '../conflicts/resolve';
import type { ConflictStrategy } from '../settings/types';
import { vaultPath } from './paths';
import { decodeBody, fetchBody, readLocal } from './transfer';
import type { TransferContext } from './transfer';

/** Стратегия подключения и способ разрешения; роль ro запрещает всё, кроме копии. */
export interface ConflictPolicy {
  readonly strategy: ConflictStrategy;
  readonly readOnly: boolean;
  readonly deps: ConflictDeps;
}

export interface ConflictPlan {
  /** Порядок обязателен: копия появляется раньше, чем затирается основной путь. */
  readonly writes: readonly WriteRequest[];
  /** Запись индекса основного пути; null — там лежит не серверная версия. */
  readonly entry: IndexEntry | null;
  /** Результат слияния или победившая локальная версия: их надо отправить. */
  readonly push: PushOp | null;
  readonly record: ConflictRecord;
}

/**
 * Разрешение одного конфликта. Вся логика стратегий лежит в conflicts,
 * здесь только подвоз содержимого обеих версий и перевод исхода в план прогона.
 */
export async function planConflict(
  ctx: TransferContext,
  op: ConflictOp,
  policy: ConflictPolicy,
): Promise<ConflictPlan> {
  const path = vaultPath(ctx.folder, op.path);
  const now = ctx.now();
  const body = await fetchBody(ctx, op.remote);
  const mtime = op.remote.mtime ?? now;
  const remote: ConflictSide = {
    data: decodeBody(op.path, body),
    mtime,
    ctime: op.remote.ctime ?? mtime,
  };
  const local: ConflictSide | null =
    op.local === null
      ? null
      : {
          data: decodeBody(op.path, await readLocal(ctx, op.path)),
          mtime: op.local.mtime,
          ctime: op.local.ctime,
        };

  const input = { path, deviceLabel: ctx.deviceLabel, now, local, remote };
  const resolution = policy.readOnly
    ? await resolveReadOnly(input, policy.deps)
    : await resolveConflict({ ...input, strategy: policy.strategy }, policy.deps);

  return {
    writes: resolution.writes,
    entry: resolution.push
      ? null
      : {
          path: op.path,
          docId: op.docId,
          rev: op.remote.rev,
          plainHash: op.remote.plainHash ?? '',
          mtime,
          size: body.byteLength,
          syncedAt: now,
          dirty: false,
          lastAuthor: op.remote.deviceLabel,
          lastDirection: 'pull',
        },
    push: resolution.push ? pushOp(op, resolution.writes, path) : null,
    record: {
      docId: op.docId,
      path,
      copyPath: resolution.copyPath,
      at: now,
      outcome: resolution.outcome,
      refusal: resolution.refusal,
    },
  };
}

/**
 * Отправка того, что легло в основной путь. Ожидаемая ревизия — серверная:
 * именно от неё разошлись стороны, и запись поверх неё не породит новый 409.
 */
function pushOp(op: ConflictOp, writes: readonly WriteRequest[], path: string): PushOp | null {
  if (op.local === null) return null;
  const main = writes.find((write) => write.path === path);
  return {
    kind: 'push',
    path: op.path,
    docId: op.docId,
    reason: op.reason,
    // Размер пересчитывается при чтении файла, здесь он только заполняет форму.
    local: {
      path: op.path,
      mtime: main?.mtime ?? op.local.mtime,
      ctime: op.local.ctime,
      size: op.local.size,
    },
    expectedRev: op.remote.rev,
  };
}
