import { TFile } from 'obsidian';
import type { App, EventRef, TAbstractFile } from 'obsidian';
import type { LocalFile } from '../engine/types';
import type { SyncManager } from './manager';

/**
 * Подписки на события хранилища. Внутри onLayoutReady обязательно: до готовности
 * раскладки Obsidian досылает create на каждый файл хранилища при индексации.
 * Снятие подписок — дело registerEvent плагина, отдельного отключения здесь нет.
 */
export function registerVaultEvents(
  app: App,
  manager: SyncManager,
  register: (ref: EventRef) => void,
): void {
  app.workspace.onLayoutReady(() => {
    const vault = app.vault;
    register(vault.on('create', (file: TAbstractFile) => manager.noteChange(file.path)));
    register(vault.on('modify', (file: TAbstractFile) => manager.noteChange(file.path)));
    register(vault.on('delete', (file: TAbstractFile) => manager.noteChange(file.path)));
    register(
      vault.on('rename', (file: TAbstractFile, oldPath: string) => {
        manager.noteRename(oldPath, file.path, statOf(file));
      }),
    );
  });
}

/** У папки статистики нет: переезд папки разберётся сверочным сканом. */
function statOf(file: TAbstractFile): Omit<LocalFile, 'path'> | null {
  if (!(file instanceof TFile)) return null;
  return { mtime: file.stat.mtime, ctime: file.stat.ctime, size: file.stat.size };
}
