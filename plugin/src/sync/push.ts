import type { SyncOp } from '../engine/ops';
import type { ProblemDoc, QueueTask, SyncQueue } from '../engine/queue';
import { moveDoc, pushDelete, pushDoc } from './transfer';
import type { TransferContext } from './transfer';

export interface PushOutcome {
  /** Пути, ушедшие на сервер: создания, обновления и переезды. */
  readonly pushed: readonly string[];
  /** Пути, помеченные на сервере надгробием. */
  readonly deleted: readonly string[];
  readonly problems: readonly ProblemDoc[];
}

/**
 * Отправляющая половина прогона. Порядок раздела 6: сначала создания,
 * обновления и переезды, только потом удаления. Обратный порядок дал бы окно,
 * в котором переехавший файл выглядит удалённым у остальных участников.
 */
export async function runPush(
  ctx: TransferContext,
  ops: readonly SyncOp[],
  queue: SyncQueue,
): Promise<PushOutcome> {
  const pushed: string[] = [];
  const deleted: string[] = [];
  const writes: QueueTask[] = [];
  const deletes: QueueTask[] = [];

  for (const op of ops) {
    if (op.kind === 'push') {
      writes.push({
        id: op.docId,
        path: op.path,
        run: async () => {
          if (await pushDoc(ctx, op)) pushed.push(op.path);
        },
      });
    } else if (op.kind === 'move') {
      writes.push({
        id: op.docId,
        path: op.path,
        run: async () => {
          await moveDoc(ctx, op);
          pushed.push(op.path);
        },
      });
    } else if (op.kind === 'pushDelete') {
      deletes.push({
        id: op.docId,
        path: op.path,
        run: async () => {
          await pushDelete(ctx, op);
          deleted.push(op.path);
        },
      });
    }
  }

  const first = await queue.run(writes);
  const second = await queue.run(deletes);
  return { pushed, deleted, problems: [...first.problems, ...second.problems] };
}
