import { prisma } from '#db';
import { countReferences, selectPrunableRevisions } from '#services/gc-plan';

/** Потолок документов за один проход: сборка не должна занимать базу надолго. */
const MAX_DOCS_PER_RUN = 500;

export type RevisionPruneResult = { docs: number; revisions: number };

/**
 * Документы, у которых ревизий больше предела. Остальные разбирать бессмысленно:
 * до среза по времени дело всё равно не дойдёт.
 */
async function crowdedDocs(spaceId: string, maxRevisions: number): Promise<string[]> {
  const groups = await prisma.docRev.groupBy({
    by: ['docId'],
    where: { spaceId },
    _count: { rev: true },
    having: { rev: { _count: { gt: maxRevisions } } },
    orderBy: { docId: 'asc' },
    take: MAX_DOCS_PER_RUN,
  });
  return groups.map((group) => group.docId);
}

/** Прунинг истории одного документа. Возвращает число снятых ревизий. */
async function pruneDoc(
  spaceId: string,
  docId: string,
  maxRevisions: number,
  cutoff: Date,
): Promise<number> {
  const revisions = await prisma.docRev.findMany({
    where: { spaceId, docId },
    select: { rev: true, createdAt: true, blobHash: true },
    orderBy: { rev: 'desc' },
  });

  const prunable = selectPrunableRevisions(revisions, maxRevisions, cutoff);
  if (prunable.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.docRev.deleteMany({
      where: { spaceId, docId, rev: { in: prunable.map((row) => row.rev) } },
    });
    // refCount считает ссылки ревизий: ушла ревизия — ушла и ссылка на тело.
    for (const [hash, count] of countReferences(prunable)) {
      await tx.blob.updateMany({
        where: { spaceId, hash },
        data: { refCount: { decrement: count } },
      });
    }
  });

  return prunable.length;
}

/** Чистка истории пространства: сверх maxRevisions и старше среза хранения. */
export async function pruneRevisions(
  spaceId: string,
  maxRevisions: number,
  cutoff: Date,
): Promise<RevisionPruneResult> {
  const result: RevisionPruneResult = { docs: 0, revisions: 0 };

  for (const docId of await crowdedDocs(spaceId, maxRevisions)) {
    const removed = await pruneDoc(spaceId, docId, maxRevisions, cutoff);
    if (removed === 0) continue;
    result.docs += 1;
    result.revisions += removed;
  }

  return result;
}
