import type { DocId, Rev } from '@vaultwire/shared';
import { describe, expect, it } from 'vitest';
import type { SyncOp } from '../../../engine/ops';
import type { LocalFile, RemoteChange } from '../../../engine/types';
import { PREVIEW_PATH_LIMIT, formatBytes, summarizePlan } from '../summary';

function docId(path: string): DocId {
  return `doc:${path}` as DocId;
}

function local(path: string, size: number): LocalFile {
  return { path, mtime: 2000, ctime: 500, size };
}

function remote(path: string, size: number): RemoteChange {
  return {
    docId: docId(path),
    rev: 2 as Rev,
    seq: 2,
    deleted: false,
    path,
    plainHash: `remote:${path}`,
    mtime: 3000,
    ctime: 500,
    size,
    blobHash: null,
    deviceLabel: 'устройство',
  };
}

function pull(path: string, size: number): SyncOp {
  return { kind: 'pull', path, docId: docId(path), reason: 'remote-created', remote: remote(path, size) };
}

function push(path: string, size: number): SyncOp {
  return {
    kind: 'push',
    path,
    docId: docId(path),
    reason: 'local-created',
    local: local(path, size),
    expectedRev: null,
  };
}

describe('summarizePlan', () => {
  it('пустой план даёт нули', () => {
    const summary = summarizePlan([]);
    expect(summary).toMatchObject({ incoming: 0, outgoing: 0, conflicts: 0, bytes: 0, total: 0 });
    expect(summary.entries).toEqual([]);
  });

  it('считает направления, конфликты и объём', () => {
    const ops: SyncOp[] = [
      pull('входящий.md', 100),
      push('исходящий.md', 20),
      {
        kind: 'conflict',
        path: 'спор.md',
        docId: docId('спор.md'),
        reason: 'both-modified',
        local: local('спор.md', 5),
        remote: remote('спор.md', 7),
      },
      {
        kind: 'pullDelete',
        path: 'ушёл.md',
        docId: docId('ушёл.md'),
        reason: 'remote-deleted',
        remote: remote('ушёл.md', 0),
      },
      {
        kind: 'pushDelete',
        path: 'стёрт.md',
        docId: docId('стёрт.md'),
        reason: 'local-deleted',
        expectedRev: 3 as Rev,
      },
      {
        kind: 'move',
        path: 'новое.md',
        docId: docId('новое.md'),
        reason: 'renamed',
        fromPath: 'старое.md',
        fromDocId: docId('старое.md'),
        fromRev: 1 as Rev,
        local: local('новое.md', 11),
      },
      { kind: 'noop', path: 'спокойный.md', docId: docId('спокойный.md'), reason: 'both-unchanged' },
    ];
    const summary = summarizePlan(ops);
    expect(summary).toMatchObject({
      incoming: 1,
      outgoing: 2,
      conflicts: 1,
      localDeletes: 1,
      remoteDeletes: 1,
      total: 6,
      // 100 принять, 20 плюс 11 отправить, конфликт переносит обе стороны 7 и 5.
      bytes: 143,
    });
    expect(summary.entries.map((entry) => entry.kind)).toEqual([
      'pull',
      'push',
      'conflict',
      'trashLocal',
      'deleteRemote',
      'push',
    ]);
    expect(summary.entries).toHaveLength(6);
  });

  it('показывает не больше двадцати путей, но считает все', () => {
    const ops = Array.from({ length: 25 }, (_, i) => pull(`файл-${i}.md`, 1));
    const summary = summarizePlan(ops);
    expect(summary.total).toBe(25);
    expect(summary.bytes).toBe(25);
    expect(summary.entries).toHaveLength(PREVIEW_PATH_LIMIT);
    expect(summary.entries[0]?.path).toBe('файл-0.md');
  });

  it('предел путей задаётся снаружи', () => {
    const ops = [pull('а.md', 1), pull('б.md', 1), pull('в.md', 1)];
    expect(summarizePlan(ops, 2).entries).toHaveLength(2);
  });
});

describe('formatBytes', () => {
  it('выбирает единицу по величине', () => {
    expect(formatBytes(0)).toBe('0 Б');
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(2048)).toBe('2 КБ');
    expect(formatBytes(1536)).toBe('1.5 КБ');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 МБ');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 ГБ');
  });
});
