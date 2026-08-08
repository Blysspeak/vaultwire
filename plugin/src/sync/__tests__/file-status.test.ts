import { describe, expect, it } from 'vitest';
import { entry } from '../../engine/__tests__/fakes';
import type { IndexEntry } from '../../engine/types';
import { fileSyncStatus } from '../file-status';
import type { FileStatusSource } from '../file-status';

function source(folder: string, entries: readonly IndexEntry[]): FileStatusSource {
  const byPath = new Map(entries.map((item) => [item.path, item]));
  return { folder, entry: (relPath) => byPath.get(relPath) };
}

describe('fileSyncStatus', () => {
  it('файл вне подключений даёт null', () => {
    const sources = [source('Заметки', [entry('a.md')])];
    expect(fileSyncStatus(sources, 'Прочее/a.md')).toBeNull();
  });

  it('файл в папке подключения без записи индекса ждёт отправки', () => {
    const sources = [source('Заметки', [])];
    expect(fileSyncStatus(sources, 'Заметки/a.md')).toEqual({
      kind: 'pending',
      at: null,
      author: null,
    });
  });

  it('помеченная правка ждёт отправки', () => {
    const sources = [source('Заметки', [entry('a.md', { dirty: true, syncedAt: 500 })])];
    expect(fileSyncStatus(sources, 'Заметки/a.md')?.kind).toBe('pending');
  });

  it('последняя отправка своя — синхронизирован', () => {
    const item = entry('a.md', { lastDirection: 'push', lastAuthor: 'Ноутбук', syncedAt: 700 });
    expect(fileSyncStatus([source('Заметки', [item])], 'Заметки/a.md')).toEqual({
      kind: 'synced',
      at: 700,
      author: 'Ноутбук',
    });
  });

  it('последняя правка приехала с сервера — виден автор', () => {
    const item = entry('a.md', { lastDirection: 'pull', lastAuthor: 'ПК Влада', syncedAt: 800 });
    expect(fileSyncStatus([source('Заметки', [item])], 'Заметки/a.md')).toEqual({
      kind: 'received',
      at: 800,
      author: 'ПК Влада',
    });
  });

  it('старая запись без направления считается синхронизированной', () => {
    const sources = [source('', [entry('a.md')])];
    expect(fileSyncStatus(sources, 'a.md')).toEqual({ kind: 'synced', at: 1000, author: null });
  });
});
