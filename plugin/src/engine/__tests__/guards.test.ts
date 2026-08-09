import { describe, expect, it } from 'vitest';
import { checkMassOperations, findCaseCollisions, findNestedConnections, isFolderConflict } from '../guards';
import type { MassThresholds } from '../guards';
import type { SyncOp } from '../ops';
import { docIdFor, remoteChange } from './fakes';

const thresholds: MassThresholds = { absolute: 20, ratio: 0.15 };

function pullDeletes(count: number): SyncOp[] {
  return Array.from({ length: count }, (_, i) => {
    const path = `note-${i}.md`;
    return {
      kind: 'pullDelete',
      path,
      docId: docIdFor(path),
      reason: 'remote-deleted',
      remote: remoteChange(path, { deleted: true, blobHash: null }),
    } satisfies SyncOp;
  });
}

describe('порог массовых операций', () => {
  it('пропускает единичные удаления', () => {
    const check = checkMassOperations(pullDeletes(2), 100, thresholds);
    expect(check.deletions).toBe(2);
    expect(check.confirmationRequired).toBe(false);
  });

  it('требует подтверждения при превышении абсолютного порога', () => {
    const check = checkMassOperations(pullDeletes(21), 1_000, thresholds);
    expect(check.confirmationRequired).toBe(true);
    expect(check.paths).toHaveLength(21);
  });

  it('требует подтверждения при превышении доли достаточно большой папки', () => {
    const check = checkMassOperations(pullDeletes(15), 50, thresholds);
    expect(check.ratio).toBeCloseTo(0.3);
    expect(check.confirmationRequired).toBe(true);
  });

  it('на маленькой папке доля не применяется: удаление одного из трёх это рутина', () => {
    const check = checkMassOperations(pullDeletes(1), 3, thresholds);
    expect(check.ratio).toBeCloseTo(0.333, 2);
    expect(check.confirmationRequired).toBe(false);
  });

  it('но абсолютный порог работает и на маленькой папке', () => {
    const check = checkMassOperations(pullDeletes(21), 21, thresholds);
    expect(check.confirmationRequired).toBe(true);
  });

  it('считает и отправку удалений: отвалившийся диск выглядит как пустая папка', () => {
    const ops: SyncOp[] = Array.from({ length: 10 }, (_, i) => {
      const path = `a-${i}.md`;
      return {
        kind: 'pushDelete',
        path,
        docId: docIdFor(path),
        reason: 'local-deleted',
        expectedRev: 1,
      } satisfies SyncOp;
    });
    ops.push({ kind: 'noop', path: 'b.md', docId: docIdFor('b.md'), reason: 'both-unchanged' });

    const check = checkMassOperations(ops, 30, thresholds);
    expect(check.deletions).toBe(10);
    expect(check.confirmationRequired).toBe(true);
  });

  it('пустой прогон подтверждения не требует', () => {
    expect(checkMassOperations([], 0, thresholds).confirmationRequired).toBe(false);
  });
});

describe('вложенность подключений и регистр путей', () => {
  it('находит папку внутри другой папки', () => {
    expect(findNestedConnections(['team', 'team/docs'])).toEqual([
      { outer: 'team', inner: 'team/docs' },
    ]);
  });

  it('корень хранилища конфликтует с любой папкой', () => {
    expect(findNestedConnections(['', 'team'])).toEqual([{ outer: '', inner: 'team' }]);
  });

  it('соседние папки не конфликтуют', () => {
    expect(findNestedConnections(['team', 'personal'])).toEqual([]);
    expect(isFolderConflict(['team'], 'personal')).toBe(false);
    expect(isFolderConflict(['team'], 'team/docs')).toBe(true);
    expect(isFolderConflict(['team/docs'], 'team')).toBe(true);
  });

  it('ловит пути, различающиеся только регистром', () => {
    expect(findCaseCollisions(['Note.md', 'note.md', 'other.md'])).toEqual([['Note.md', 'note.md']]);
    expect(findCaseCollisions(['a.md', 'b.md'])).toEqual([]);
  });
});
