import type { App } from 'obsidian';
import { fileSyncStatus } from '../sync/file-status';
import type { FileStatusSource, FileSyncStatus } from '../sync/file-status';
import type { SyncManager } from '../sync';

/**
 * Состояние активного файла для строки состояния. Индекс подключения читается
 * на месте: копии состояния файлов нигде не заводится, и заметка не правится.
 */
export function activeFileStatus(app: App, manager: SyncManager | null): FileSyncStatus | null {
  if (manager === null) return null;
  const file = app.workspace.getActiveFile();
  if (file === null) return null;
  return fileSyncStatus(sourcesOf(manager), file.path);
}

function sourcesOf(manager: SyncManager): readonly FileStatusSource[] {
  return manager.all().map((runtime) => ({
    folder: runtime.connection.folder,
    entry: (relPath: string) => runtime.connection.index.get(relPath),
  }));
}
