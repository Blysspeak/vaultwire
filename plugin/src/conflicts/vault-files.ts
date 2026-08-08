import type { App } from 'obsidian';
import { isConflictCopy } from './naming';
import type { ConflictFiles } from './registry';

/**
 * Единственное место, где реестр конфликтов встречается с Obsidian.
 * Удаление идёт через fileManager.trashFile: vault.delete уносит файл мимо
 * корзины и мимо настройки пользователя.
 */
export class ObsidianConflictFiles implements ConflictFiles {
  constructor(private readonly app: App) {}

  exists(path: string): boolean {
    return this.app.vault.getFileByPath(path) !== null;
  }

  /** Переименование через fileManager: он же чинит ссылки на переехавший файл. */
  async rename(from: string, to: string): Promise<void> {
    const file = this.app.vault.getFileByPath(from);
    if (file === null) return;
    await this.app.fileManager.renameFile(file, to);
  }

  async trash(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (file === null) return;
    await this.app.fileManager.trashFile(file);
  }
}

/**
 * Конфликтные копии внутри папки подключения. Чужие копии приходят обычной
 * синхронизацией и в реестре не значатся, поэтому команда очистки ищет по имени.
 */
export function findConflictCopies(app: App, folder: string): string[] {
  const prefix = folder === '' ? '' : `${folder}/`;
  return app.vault
    .getFiles()
    .map((file) => file.path)
    .filter((path) => path.startsWith(prefix) && isConflictCopy(path));
}
