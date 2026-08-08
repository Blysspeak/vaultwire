import { describe, expect, it } from 'vitest';
import { run, single } from './decide-helpers';
import { delta, entry, localFile, remoteChange } from './fakes';

const rename = { fromPath: 'a.md', toPath: 'sub/b.md', file: localFile('sub/b.md') };

describe('переезд файла', () => {
  it('переименование даёт один move, а не пару удаления и создания', () => {
    const ops = run({
      index: [entry('a.md', { rev: 5 })],
      local: delta({ created: [localFile('sub/b.md')], deleted: ['a.md'] }),
      renames: [rename],
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: 'move',
      fromPath: 'a.md',
      fromRev: 5,
      path: 'sub/b.md',
      reason: 'renamed',
    });
  });

  it('переезд документа, который тронул сервер, превращается в конфликт', () => {
    const ops = run({
      index: [entry('a.md')],
      local: delta({ created: [localFile('sub/b.md')], deleted: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 9 })],
      renames: [rename],
    });
    expect(ops[0]).toMatchObject({ kind: 'conflict', reason: 'both-modified', path: 'a.md' });
    // Файл физически лежит по новому пути, поэтому уходит на сервер отдельным документом.
    expect(ops[1]).toMatchObject({ kind: 'push', reason: 'local-created', path: 'sub/b.md' });
    expect(ops).toHaveLength(2);
  });

  it('переименование несинхронизированного файла разбирается как обычное создание', () => {
    const op = single({
      local: delta({ created: [localFile('sub/b.md')] }),
      renames: [rename],
    });
    expect(op).toMatchObject({ kind: 'push', reason: 'local-created', path: 'sub/b.md' });
  });
});

describe('роль только для чтения', () => {
  it('локальная правка не отправляется', () => {
    const op = single({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ modified: [localFile('a.md')] }),
    });
    expect(op).toMatchObject({ kind: 'noop', reason: 'read-only' });
  });

  it('при встречной правке отдаёт конфликт: локальная версия не затирается', () => {
    const op = single({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ modified: [localFile('a.md')] }),
      remote: [remoteChange('a.md', { rev: 2 })],
    });
    expect(op).toMatchObject({ kind: 'conflict', reason: 'both-modified' });
  });

  it('при удалении на сервере локальная правка сохраняется конфликтной копией', () => {
    const op = single({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ modified: [localFile('a.md')] }),
      remote: [remoteChange('a.md', { rev: 4, deleted: true, blobHash: null })],
    });
    expect(op).toMatchObject({ kind: 'conflict', reason: 'local-modified-remote-deleted' });
  });

  it('локальное удаление не уходит на сервер', () => {
    const op = single({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ deleted: ['a.md'] }),
    });
    expect(op).toMatchObject({ kind: 'noop', reason: 'read-only' });
  });

  it('переименование не уходит на сервер', () => {
    const ops = run({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ created: [localFile('sub/b.md')], deleted: ['a.md'] }),
      renames: [rename],
    });
    expect(ops).toEqual([
      expect.objectContaining({ kind: 'noop', reason: 'read-only', path: 'sub/b.md' }),
    ]);
  });

  it('серверные изменения принимаются как обычно', () => {
    const op = single({
      role: 'ro',
      index: [entry('a.md')],
      local: delta({ unchanged: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 2 })],
    });
    expect(op).toMatchObject({ kind: 'pull', reason: 'remote-modified' });
  });
});
