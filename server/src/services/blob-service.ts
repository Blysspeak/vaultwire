import type { BlobHash } from '@vaultwire/shared';
import { prisma } from '#db';
import { logger } from '#logger';
import { ProtocolError } from '#protocol-error';
import { blobStore, sha256Hex } from '#services/blob-store';
import { assertBlobSize, assertWithinQuota, type QuotaState } from '#services/quota';

export type StoredBlob = { hash: BlobHash; size: number; created: boolean };

type Reservation = { created: boolean; size: number };

/**
 * Место под тело резервируется под блокировкой строки пространства:
 * иначе два одновременных заливщика вдвоём проскочат последний свободный мегабайт.
 */
async function reserve(spaceId: string, hash: string, size: number): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<QuotaState[]>`
      SELECT "usedBytes", "quotaBytes" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE
    `;
    const space = locked[0];
    if (space === undefined) {
      throw new ProtocolError('not_found', 'пространство не найдено');
    }

    const existing = await tx.blob.findUnique({
      where: { spaceId_hash: { spaceId, hash } },
      select: { size: true },
    });
    if (existing !== null) return { created: false, size: existing.size };

    assertWithinQuota(space, size);

    await tx.blob.create({ data: { spaceId, hash, size } });
    await tx.space.update({ where: { id: spaceId }, data: { usedBytes: { increment: BigInt(size) } } });
    return { created: true, size };
  });
}

/** Откат резервирования, если файл не удалось записать. */
async function release(spaceId: string, hash: string, size: number): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.blob.delete({ where: { spaceId_hash: { spaceId, hash } } }),
      prisma.space.update({ where: { id: spaceId }, data: { usedBytes: { decrement: BigInt(size) } } }),
    ]);
  } catch (error) {
    // Строка без файла не опасна: повторная заливка того же тела допишет файл.
    logger.error({ err: error, spaceId, hash }, 'не удалось откатить резервирование тела');
  }
}

/** Приём сырого тела: сервер сам считает SHA-256 и сверяет с заголовком X-Blob-Sha256. */
export async function storeBlob(spaceId: string, declaredHash: string, body: Buffer): Promise<StoredBlob> {
  const size = body.byteLength;
  assertBlobSize(size);

  const actual = sha256Hex(body);
  if (actual !== declaredHash) {
    throw new ProtocolError('invalid_blob_hash', 'хеш тела не совпал с заголовком', { actual });
  }

  const hash = actual as BlobHash;
  const reservation = await reserve(spaceId, hash, size);

  if (!reservation.created) {
    // Файла может не быть, если прошлая попытка упала между коммитом и записью на диск.
    if (!(await blobStore.has(spaceId, hash))) {
      await blobStore.put(spaceId, hash, body);
    }
    return { hash, size: reservation.size, created: false };
  }

  try {
    await blobStore.put(spaceId, hash, body);
  } catch (error) {
    await release(spaceId, hash, size);
    throw error;
  }
  return { hash, size, created: true };
}

export async function readBlob(spaceId: string, hash: string): Promise<Buffer> {
  const row = await prisma.blob.findUnique({
    where: { spaceId_hash: { spaceId, hash } },
    select: { size: true },
  });
  if (row === null) {
    throw new ProtocolError('not_found', 'тело не найдено');
  }

  const data = await blobStore.read(spaceId, hash);
  if (data === null) {
    logger.error({ spaceId, hash }, 'запись тела есть, а файла нет');
    throw new ProtocolError('not_found', 'тело не найдено');
  }
  return data;
}
