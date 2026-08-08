import { config } from '#config';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';

/** Состояние квоты пространства, читается под блокировкой строки Space. */
export type QuotaState = { usedBytes: bigint; quotaBytes: bigint };

/** Влезает ли ещё одно тело. Считается по телам: документ байт не добавляет. */
export function fitsQuota(state: QuotaState, incomingBytes: number): boolean {
  return state.usedBytes + BigInt(incomingBytes) <= state.quotaBytes;
}

export function assertWithinQuota(state: QuotaState, incomingBytes: number): void {
  if (fitsQuota(state, incomingBytes)) return;
  throw new ProtocolError('quota_exceeded', 'квота пространства исчерпана', {
    quotaBytes: Number(state.quotaBytes),
    usedBytes: Number(state.usedBytes),
  });
}

/** Предел одного тела. Пустое тело смысла не имеет и разбирается как ошибка запроса. */
export function assertBlobSize(size: number, maxBytes: number = config.maxBlobBytes): void {
  if (size === 0) {
    throw new ProtocolError('bad_request', 'пустое тело');
  }
  if (size > maxBytes) {
    throw new ProtocolError('too_large', 'тело больше предела', { maxBlobBytes: maxBytes });
  }
}

/**
 * Пересчёт занятого объёма по строкам тел. Инкременты при заливке и удалении
 * могут разойтись с фактом после сбоя, поэтому сборщик мусора закрывает проход
 * пересчётом. Блокировка строки обязательна: иначе пересчёт затрёт заливку,
 * прошедшую между суммой и записью.
 */
export async function recomputeUsedBytes(spaceId: string): Promise<bigint> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE`;
    const sum = await tx.blob.aggregate({ where: { spaceId }, _sum: { size: true } });
    const usedBytes = BigInt(sum._sum.size ?? 0);
    await tx.space.update({ where: { id: spaceId }, data: { usedBytes } });
    return usedBytes;
  });
}
