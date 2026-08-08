import type { IndexEntry } from '../engine/types';
import { relativePath } from './paths';

/**
 * Состояние одного файла для строки состояния. Ничего не пишется в сам файл:
 * всё берётся из индекса подключения, который живёт вне дерева заметок.
 */

export const FILE_SYNC_KINDS = ['pending', 'synced', 'received'] as const;
export type FileSyncKind = (typeof FILE_SYNC_KINDS)[number];

export interface FileSyncStatus {
  readonly kind: FileSyncKind;
  /** Момент последней синхронизации; null — файл ещё ни разу не уезжал. */
  readonly at: number | null;
  /** Метка устройства последней правки; null у старых записей индекса. */
  readonly author: string | null;
}

/** Минимум от подключения: строка состояния не должна знать о SyncConnection. */
export interface FileStatusSource {
  readonly folder: string;
  entry(relPath: string): IndexEntry | undefined;
}

/**
 * Состояние файла по пути от корня хранилища; null — файл вне подключений.
 * Первое подходящее подключение и выигрывает: вложенные папки не поддерживаются.
 */
export function fileSyncStatus(
  sources: readonly FileStatusSource[],
  vaultFilePath: string,
): FileSyncStatus | null {
  for (const source of sources) {
    const relPath = relativePath(source.folder, vaultFilePath);
    if (relPath === null) continue;
    const entry = source.entry(relPath);
    // Файл в папке подключения, но не в индексе: новый и ещё не отправленный.
    if (entry === undefined) return { kind: 'pending', at: null, author: null };
    if (entry.dirty) return { kind: 'pending', at: entry.syncedAt, author: entry.lastAuthor };
    return {
      kind: entry.lastDirection === 'pull' ? 'received' : 'synced',
      at: entry.syncedAt,
      author: entry.lastAuthor,
    };
  }
  return null;
}
