import { prisma } from '#db';
import { logger } from '#logger';
import { blobStore } from '#services/blob-store';
import { ORPHAN_GRACE_MS, selectDeletableBlobs, type BlobRow } from '#services/gc-plan';

/** Потолок тел за один проход: удаление файлов идёт по одному. */
const MAX_BLOBS_PER_RUN = 500;

export type BlobSweepResult = { removed: number; bytes: number };

/**
 * Кандидаты: счётчик ссылок на нуле. Возраст проверяет gc-plan, чтобы правило
 * жило в одном месте и покрывалось тестами.
 */
async function candidates(spaceId: string, now: Date): Promise<BlobRow[]> {
  return prisma.blob.findMany({
    where: { spaceId, refCount: { lte: 0 }, createdAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } },
    select: { hash: true, size: true, refCount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_BLOBS_PER_RUN,
  });
}

/**
 * Физическое удаление тел без ссылок. Сначала строка, потом файл: строка без
 * файла ломает выдачу, а файл без строки это всего лишь мусор до следующего прохода.
 */
export async function sweepBlobs(spaceId: string, now: Date): Promise<BlobSweepResult> {
  const result: BlobSweepResult = { removed: 0, bytes: 0 };

  for (const blob of selectDeletableBlobs(await candidates(spaceId, now), now)) {
    // Счётчик мог разойтись с фактом: перед удалением сверяемся с индексом ревизий.
    const refs = await prisma.docRev.count({ where: { spaceId, blobHash: blob.hash } });
    if (refs > 0) {
      logger.warn({ spaceId, hash: blob.hash, refs }, 'счётчик ссылок разошёлся, восстановлен');
      await prisma.blob.updateMany({ where: { spaceId, hash: blob.hash }, data: { refCount: refs } });
      continue;
    }

    await prisma.blob.deleteMany({ where: { spaceId, hash: blob.hash } });
    await blobStore.remove(spaceId, blob.hash);
    result.removed += 1;
    result.bytes += blob.size;
  }

  return result;
}
