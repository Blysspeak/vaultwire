import { config } from '#config';
import { prisma } from '#db';
import { logger } from '#logger';
import { sweepBlobs } from '#services/gc-blobs';
import { retentionCutoff } from '#services/gc-plan';
import { pruneRevisions } from '#services/gc-revisions';
import { recomputeUsedBytes } from '#services/quota';

export type GcSummary = { spaces: number; docs: number; revisions: number; blobs: number; bytes: number };

/**
 * Один проход сборки мусора: чистка истории сверх пределов пространства,
 * затем физическое удаление тел, на которые не осталось ссылок.
 * Порядок важен: ссылки снимает прунинг, иначе сносить будет нечего.
 */
export async function runGc(now: Date = new Date()): Promise<GcSummary> {
  const spaces = await prisma.space.findMany({
    select: { id: true, retentionDays: true, maxRevisions: true },
  });

  const summary: GcSummary = { spaces: spaces.length, docs: 0, revisions: 0, blobs: 0, bytes: 0 };

  for (const space of spaces) {
    const pruned = await pruneRevisions(space.id, space.maxRevisions, retentionCutoff(now, space.retentionDays));
    const swept = await sweepBlobs(space.id, now);

    if (swept.removed > 0) await recomputeUsedBytes(space.id);

    summary.docs += pruned.docs;
    summary.revisions += pruned.revisions;
    summary.blobs += swept.removed;
    summary.bytes += swept.bytes;
  }

  return summary;
}

/**
 * Запуск по расписанию. Проходы не накладываются друг на друга: длинная сборка
 * на большом пространстве иначе запустила бы вторую поверх себя.
 * Возвращает функцию останова для корректного завершения процесса.
 */
export function startGc(): () => void {
  if (config.gcIntervalMs === 0) {
    logger.info('сборка мусора отключена: GC_INTERVAL_MS = 0');
    return () => {};
  }

  let running = false;

  const timer = setInterval(() => {
    if (running) {
      logger.warn('предыдущий проход сборки мусора ещё идёт, пропуск');
      return;
    }
    running = true;
    runGc()
      .then((summary) => {
        if (summary.revisions > 0 || summary.blobs > 0) {
          logger.info(summary, 'сборка мусора завершена');
        }
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'проход сборки мусора сорвался');
      })
      .finally(() => {
        running = false;
      });
  }, config.gcIntervalMs);

  // Таймер не должен держать процесс живым при остановке сервера.
  timer.unref();
  logger.info({ intervalMs: config.gcIntervalMs }, 'сборка мусора запланирована');

  return () => {
    clearInterval(timer);
  };
}
