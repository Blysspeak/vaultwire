import type { BlobHash, ChangeItem, ChangesResponse, DocId } from '@vaultwire/shared';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';

const SELECT = {
  docId: true,
  rev: true,
  seq: true,
  deleted: true,
  metaCipher: true,
  blobHash: true,
  size: true,
} as const;

type Row = {
  docId: string;
  rev: number;
  seq: bigint;
  deleted: boolean;
  metaCipher: string | null;
  blobHash: string | null;
  size: number;
};

// Бренды shared: форму значений гарантировали схемы на записи, повторно не проверяем.
function toItem(row: Row): ChangeItem {
  return {
    docId: row.docId as DocId,
    rev: row.rev,
    seq: Number(row.seq),
    deleted: row.deleted,
    metaCipher: row.metaCipher,
    blobHash: row.blobHash as BlobHash | null,
    size: row.size,
  };
}

/**
 * Догон изменений: метаданные без тел.
 * Запрос ложится строго на индекс (spaceId, seq), это WHERE spaceId = ? AND seq > ? ORDER BY seq LIMIT ?.
 */
export async function listChanges(spaceId: string, since: number, limit: number): Promise<ChangesResponse> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { seq: true } });
  if (space === null) {
    throw new ProtocolError('not_found', 'пространство не найдено');
  }

  const rows = await prisma.doc.findMany({
    where: { spaceId, seq: { gt: BigInt(since) } },
    orderBy: [{ seq: 'asc' }, { docId: 'asc' }],
    take: limit,
    select: SELECT,
  });

  // Переезд кладёт две записи под одним seq. Обрывать страницу внутри такой группы нельзя:
  // клиент продолжит с since = seq последней записи и молча потеряет вторую.
  const last = rows.at(-1);
  const tail =
    rows.length === limit && last !== undefined
      ? await prisma.doc.findMany({
          where: { spaceId, seq: last.seq, docId: { gt: last.docId } },
          orderBy: { docId: 'asc' },
          select: SELECT,
        })
      : [];

  return { seq: Number(space.seq), items: [...rows, ...tail].map(toItem) };
}
