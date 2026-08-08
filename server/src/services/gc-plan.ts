/**
 * Правила отбора мусора без единого обращения к базе: их и покрывают тесты.
 * Сами удаления делают gc-revisions и gc-blobs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Отсрочка для тела, на которое не ссылается ни одна ревизия. Заливка тела и
 * запись документа идут разными запросами, поэтому только что залитое тело
 * штатно живёт без ссылок и сносить его сразу нельзя.
 */
export const ORPHAN_GRACE_MS = DAY_MS;

export type RevisionRow = { rev: number; createdAt: Date; blobHash: string | null };
export type BlobRow = { hash: string; size: number; refCount: number; createdAt: Date };

/** Всё, что старше среза, выходит за срок хранения пространства. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - Math.max(0, retentionDays) * DAY_MS);
}

/**
 * История: последние maxRevisions ревизий или retentionDays, что больше.
 * Значит ревизия уходит, только если она и вне числа последних, и старше среза.
 * Текущая ревизия не удаляется никогда: на её тело ссылается сам документ.
 */
export function selectPrunableRevisions(
  revisions: readonly RevisionRow[],
  maxRevisions: number,
  cutoff: Date,
): RevisionRow[] {
  const keep = Math.max(1, maxRevisions);
  const newestFirst = [...revisions].sort((left, right) => right.rev - left.rev);
  return newestFirst.slice(keep).filter((row) => row.createdAt.getTime() < cutoff.getTime());
}

/**
 * Тела к физическому удалению: ссылок нет и отсрочка вышла.
 * Отдельный срок хранения здесь не проверяется: ссылки снимает только прунинг
 * ревизий, а он трогает лишь то, что уже старше retentionDays.
 */
export function selectDeletableBlobs(blobs: readonly BlobRow[], now: Date): BlobRow[] {
  const threshold = now.getTime() - ORPHAN_GRACE_MS;
  return blobs.filter((blob) => blob.refCount <= 0 && blob.createdAt.getTime() < threshold);
}

/** Сколько ссылок снимает удаление набора ревизий, по каждому телу. */
export function countReferences(revisions: readonly RevisionRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of revisions) {
    if (row.blobHash === null) continue;
    counts.set(row.blobHash, (counts.get(row.blobHash) ?? 0) + 1);
  }
  return counts;
}
