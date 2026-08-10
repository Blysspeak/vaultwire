import { PROTOCOL_LIMITS } from '@vaultwire/shared';
import type { BatchDocItem, BatchDocResult } from '@vaultwire/shared';
import type { PushOp } from '../engine/ops';
import type { ProblemDoc, QueueTask } from '../engine/queue';
import { SyncQueue } from '../engine/queue';
import { commitPush, preparePush } from './transfer';
import type { PreparedPush, TransferContext } from './transfer';

export interface BatchPushOutcome {
  readonly pushed: readonly string[];
  readonly problems: readonly ProblemDoc[];
}

/**
 * Создания и обновления пачками до 50 документов: тело каждого файла всё равно
 * заливается отдельным запросом, но запись метаданных больше не стоит по одному
 * круговороту до сервера на файл. Первичный снимок большого хранилища иначе
 * тянется на порядок дольше почти без пользы от сети: 3911 файлов при
 * конкурентности 4 это почти две тысячи последовательных пар запросов.
 */
export async function runBatchPush(
  ctx: TransferContext,
  ops: readonly PushOp[],
  concurrency: number,
): Promise<BatchPushOutcome> {
  const prepared = await prepareAll(ctx, ops, concurrency);
  const pushed: string[] = [];
  const problems: ProblemDoc[] = [...prepared.problems];

  for (const chunk of chunksOf(prepared.items, PROTOCOL_LIMITS.batchMaxDocs)) {
    const outcome = await sendChunk(ctx, chunk);
    pushed.push(...outcome.pushed);
    problems.push(...outcome.problems);
  }
  return { pushed, problems };
}

/** Заливка тел остаётся по одному файлу, но идёт с той же конкурентностью прогона. */
async function prepareAll(
  ctx: TransferContext,
  ops: readonly PushOp[],
  concurrency: number,
): Promise<{ items: readonly PreparedPush[]; problems: readonly ProblemDoc[] }> {
  const items: PreparedPush[] = [];
  const queue = new SyncQueue({ concurrency });
  const tasks: QueueTask[] = ops.map((op) => ({
    id: op.docId,
    path: op.path,
    run: async () => {
      const item = await preparePush(ctx, op);
      if (item !== null) items.push(item);
    },
  }));
  const report = await queue.run(tasks);
  return { items, problems: report.problems };
}

async function sendChunk(
  ctx: TransferContext,
  chunk: readonly PreparedPush[],
): Promise<{ pushed: string[]; problems: ProblemDoc[] }> {
  const byId = new Map(chunk.map((item) => [item.docId, item] as const));
  let results: readonly BatchDocResult[];
  try {
    results = await ctx.client.batchDocs(ctx.spaceId, { items: chunk.map(toBatchItem) });
  } catch (error) {
    // Батч не применился целиком: транспорт или отказ до записи. Каждый элемент
    // в проблемные, чтобы панель показала их и позволила повторить.
    const message = error instanceof Error ? error.message : String(error);
    return {
      pushed: [],
      problems: chunk.map((item) => ({ id: item.docId, path: item.path, message, attempts: 1 })),
    };
  }

  const pushed: string[] = [];
  const problems: ProblemDoc[] = [];
  for (const result of results) {
    const item = byId.get(result.docId);
    if (item === undefined) continue;
    if ('error' in result) {
      problems.push({ id: item.docId, path: item.path, message: result.error.message, attempts: 1 });
      continue;
    }
    commitPush(ctx, item.path, item.docId, result.rev, item.upload, item.local.mtime);
    pushed.push(item.path);
  }
  return { pushed, problems };
}

function toBatchItem(item: PreparedPush): BatchDocItem {
  return {
    docId: item.docId,
    metaCipher: item.metaCipher,
    blobHash: item.upload.blobHash,
    size: item.upload.size,
    expectedRev: item.expectedRev,
  };
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
