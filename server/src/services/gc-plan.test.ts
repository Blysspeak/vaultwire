import { describe, expect, it } from 'vitest';
import {
  countReferences,
  ORPHAN_GRACE_MS,
  retentionCutoff,
  selectDeletableBlobs,
  selectPrunableRevisions,
  type BlobRow,
  type RevisionRow,
} from '#services/gc-plan';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function revision(rev: number, ageDays: number, blobHash: string | null = `hash-${rev}`): RevisionRow {
  return { rev, createdAt: daysAgo(ageDays), blobHash };
}

describe('retentionCutoff', () => {
  it('отсчитывает срез назад от текущего момента', () => {
    expect(retentionCutoff(NOW, 30).getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
  });

  it('отрицательный срок хранения не двигает срез в будущее', () => {
    expect(retentionCutoff(NOW, -5).getTime()).toBe(NOW.getTime());
  });
});

describe('selectPrunableRevisions', () => {
  const cutoff = retentionCutoff(NOW, 30);

  it('снимает только то, что и вне числа последних, и старше среза', () => {
    const revisions = [revision(5, 1), revision(4, 2), revision(3, 40), revision(2, 60), revision(1, 90)];
    expect(selectPrunableRevisions(revisions, 3, cutoff).map((row) => row.rev)).toEqual([2, 1]);
  });

  it('держит последние maxRevisions, даже если они древние', () => {
    const revisions = [revision(3, 300), revision(2, 400), revision(1, 500)];
    expect(selectPrunableRevisions(revisions, 3, cutoff)).toEqual([]);
  });

  it('держит свежие ревизии сверх предела: срок хранения важнее числа', () => {
    const revisions = [revision(4, 1), revision(3, 2), revision(2, 3), revision(1, 4)];
    expect(selectPrunableRevisions(revisions, 2, cutoff)).toEqual([]);
  });

  it('никогда не снимает текущую ревизию', () => {
    const revisions = [revision(2, 500), revision(1, 600)];
    expect(selectPrunableRevisions(revisions, 0, cutoff).map((row) => row.rev)).toEqual([1]);
  });

  it('не зависит от порядка на входе', () => {
    const revisions = [revision(1, 90), revision(5, 1), revision(3, 40)];
    expect(selectPrunableRevisions(revisions, 1, cutoff).map((row) => row.rev)).toEqual([3, 1]);
  });
});

describe('selectDeletableBlobs', () => {
  function blob(hash: string, refCount: number, ageMs: number): BlobRow {
    return { hash, size: 10, refCount, createdAt: new Date(NOW.getTime() - ageMs) };
  }

  it('берёт тела без ссылок старше суток', () => {
    const rows = [
      blob('a', 0, ORPHAN_GRACE_MS + 1000),
      blob('b', 1, ORPHAN_GRACE_MS + 1000),
      blob('c', 0, ORPHAN_GRACE_MS - 1000),
    ];
    expect(selectDeletableBlobs(rows, NOW).map((row) => row.hash)).toEqual(['a']);
  });

  it('только что залитое тело без ссылок не трогает', () => {
    expect(selectDeletableBlobs([blob('fresh', 0, 0)], NOW)).toEqual([]);
  });

  it('отрицательный счётчик считается отсутствием ссылок', () => {
    expect(selectDeletableBlobs([blob('drift', -2, ORPHAN_GRACE_MS * 2)], NOW)).toHaveLength(1);
  });
});

describe('countReferences', () => {
  it('считает ссылки по телам и пропускает надгробия', () => {
    const rows = [revision(3, 1, 'x'), revision(2, 2, 'x'), revision(1, 3, null)];
    expect([...countReferences(rows)]).toEqual([['x', 2]]);
  });
});
