import type { BlobHash, DeviceId, ListRevisionsResponse } from '@vaultwire/shared';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';

/** Верхняя граница выдачи истории: панель показывает последние ревизии, а не всю ленту. */
const HISTORY_HARD_LIMIT = 100;

/**
 * История документа от свежей ревизии к старой.
 * Размер берётся из записи тела: в DocRev его нет, а показывать в панели нужно.
 */
export async function listRevisions(spaceId: string, docId: string): Promise<ListRevisionsResponse> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { maxRevisions: true } });
  if (space === null) {
    throw new ProtocolError('not_found', 'пространство не найдено');
  }

  const rows = await prisma.docRev.findMany({
    where: { spaceId, docId },
    orderBy: { rev: 'desc' },
    take: Math.min(Math.max(space.maxRevisions, 1), HISTORY_HARD_LIMIT),
    select: {
      rev: true,
      seq: true,
      deleted: true,
      metaCipher: true,
      blobHash: true,
      deviceId: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) {
    throw new ProtocolError('not_found', 'документ не найден');
  }

  const hashes = [...new Set(rows.flatMap((row) => (row.blobHash === null ? [] : [row.blobHash])))];
  const blobs = await prisma.blob.findMany({
    where: { spaceId, hash: { in: hashes } },
    select: { hash: true, size: true },
  });
  const sizeByHash = new Map(blobs.map((blob) => [blob.hash, blob.size]));

  // Бренды shared: форму значений гарантировали схемы на записи.
  return rows.map((row) => ({
    rev: row.rev,
    seq: Number(row.seq),
    deleted: row.deleted,
    metaCipher: row.metaCipher,
    blobHash: row.blobHash as BlobHash | null,
    size: row.blobHash === null ? 0 : (sizeByHash.get(row.blobHash) ?? 0),
    deviceId: row.deviceId as DeviceId,
    createdAt: row.createdAt.getTime(),
  }));
}
