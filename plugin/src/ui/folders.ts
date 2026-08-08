import type { App } from 'obsidian';
import { t } from '../i18n/ru';

/** Пункт выпадающего списка папок: значение и подпись. */
export interface FolderOption {
  /** Путь от корня хранилища; пустая строка — корень. */
  readonly value: string;
  readonly label: string;
}

/**
 * Папки хранилища для выбора корня подключения. Корень идёт первым и хранится
 * пустой строкой: подключение считает пути от своей папки, а не от «/».
 */
export function folderOptions(app: App): FolderOption[] {
  const options: FolderOption[] = [{ value: '', label: t('settings.connections.folderRoot') }];
  for (const folder of app.vault.getAllFolders(false)) {
    const path = folder.path;
    if (path === '' || path === '/' || path.startsWith('.')) continue;
    options.push({ value: path, label: path });
  }
  options.sort(byLabel);
  return options;
}

function byLabel(a: FolderOption, b: FolderOption): number {
  if (a.value === '') return -1;
  if (b.value === '') return 1;
  return a.label.localeCompare(b.label, 'ru');
}
