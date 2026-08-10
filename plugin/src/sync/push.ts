import type { SyncOp } from '../engine/ops';
import type { ProblemDoc, QueueTask } from '../engine/queue';
import { SyncQueue } from '../engine/queue';
import { runBatchPush } from './push-batch';
import { moveDoc, pushDelete } from './transfer';
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
 *
 * Создания и обновления уходят пачками через runBatchPush — это то место,
 * где при первичной заливке большого хранилища счёт идёт на тысячи файлов и
 * запрос на каждый по отдельности превращает секунды в десятки минут.
 * Переезды остаются одиночными: атомарный эндпоинт под них уже есть, а массово
 * они не случаются. Удаления батч не поддерживает: элемент батча требует тело.
 */
export async function runPush(
  ctx: TransferContext,
  ops: readonly SyncOp[],
  concurrency: number,
): Promise<PushOutcome> {
  const pushOps = ops.filter((op) => op.kind === 'push');
  const moved: string[] = [];
  const deleted: string[] = [];
  const moveTasks: QueueTask[] = [];
  const deleteTasks: QueueTask[] = [];

  for (const op of ops) {
    if (op.kind === 'move') {
      moveTasks.push({
        id: op.docId,
        path: op.path,
        run: async () => {
          await moveDoc(ctx, op);
          moved.push(op.path);
        },
      });
    } else if (op.kind === 'pushDelete') {
      deleteTasks.push({
        id: op.docId,
        path: op.path,
        run: async () => {
          await pushDelete(ctx, op);
          deleted.push(op.path);
        },
      });
    }
  }

  const moveQueue = new SyncQueue({ concurrency });
  const [batch, moveReport] = await Promise.all([
    runBatchPush(ctx, pushOps, concurrency),
    moveQueue.run(moveTasks),
  ]);

  const deleteQueue = new SyncQueue({ concurrency });
  const deleteReport = await deleteQueue.run(deleteTasks);

  return {
    pushed: [...batch.pushed, ...moved],
    deleted,
    problems: [...batch.problems, ...moveReport.problems, ...deleteReport.problems],
  };
}
