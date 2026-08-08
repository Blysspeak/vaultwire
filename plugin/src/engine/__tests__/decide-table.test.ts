import { describe, expect, it } from 'vitest';
import { single } from './decide-helpers';
import { delta, docIdFor, entry, localFile, remoteChange } from './fakes';

/** Все одиннадцать строк таблицы трёхстороннего сравнения из раздела 6. */
describe('таблица решений раздела 6', () => {
  it('строка 1: без изменений с обеих сторон — ничего', () => {
    const op = single({ index: [entry('a.md')], local: delta({ unchanged: ['a.md'] }) });
    expect(op).toMatchObject({ kind: 'noop', reason: 'both-unchanged' });
  });

  it('строка 2: изменено локально — отправить', () => {
    const op = single({
      index: [entry('a.md', { rev: 7 })],
      local: delta({ modified: [localFile('a.md')] }),
    });
    expect(op).toMatchObject({ kind: 'push', reason: 'local-modified', expectedRev: 7 });
  });

  it('строка 3: изменено на сервере — принять', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ unchanged: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 2 })],
    });
    expect(op).toMatchObject({ kind: 'pull', reason: 'remote-modified' });
  });

  it('строка 4: изменено с обеих сторон — конфликт', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ modified: [localFile('a.md')] }),
      remote: [remoteChange('a.md', { rev: 2 })],
    });
    expect(op).toMatchObject({ kind: 'conflict', reason: 'both-modified' });
  });

  it('строка 5: удалено локально — отправить удаление', () => {
    const op = single({
      index: [entry('a.md', { rev: 3 })],
      local: delta({ deleted: ['a.md'] }),
    });
    expect(op).toMatchObject({ kind: 'pushDelete', reason: 'local-deleted', expectedRev: 3 });
  });

  it('строка 6: удалено на сервере — удалить локально в корзину', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ unchanged: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 2, deleted: true, blobHash: null })],
    });
    expect(op).toMatchObject({ kind: 'pullDelete', reason: 'remote-deleted' });
  });

  it('строка 7: удалено локально, изменено на сервере — файл воскресает', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ deleted: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 2 })],
    });
    expect(op).toMatchObject({ kind: 'pull', reason: 'local-deleted-remote-modified' });
  });

  it('строка 8: изменено локально, удалено на сервере — отправить поверх надгробия', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ modified: [localFile('a.md')] }),
      remote: [remoteChange('a.md', { rev: 4, deleted: true, blobHash: null })],
    });
    expect(op).toMatchObject({
      kind: 'push',
      reason: 'local-modified-remote-deleted',
      expectedRev: 4,
    });
  });

  it('строка 9: создано локально — отправить создание', () => {
    const op = single({ local: delta({ created: [localFile('new.md')] }) });
    expect(op).toMatchObject({ kind: 'push', reason: 'local-created', expectedRev: null });
    expect(op.docId).toBe(docIdFor('new.md'));
  });

  it('строка 10: создано на сервере — принять создание', () => {
    const op = single({ remote: [remoteChange('new.md', { rev: 1 })] });
    expect(op).toMatchObject({ kind: 'pull', reason: 'remote-created' });
  });

  it('строка 11: создано с обеих сторон — конфликт', () => {
    const op = single({
      local: delta({ created: [localFile('new.md')] }),
      remote: [remoteChange('new.md', { rev: 1 })],
    });
    expect(op).toMatchObject({ kind: 'conflict', reason: 'both-created' });
  });

  it('обоюдное удаление не даёт операций записи', () => {
    const op = single({
      index: [entry('a.md')],
      local: delta({ deleted: ['a.md'] }),
      remote: [remoteChange('a.md', { rev: 2, deleted: true, blobHash: null })],
    });
    expect(op).toMatchObject({ kind: 'noop', reason: 'both-deleted' });
  });
});
