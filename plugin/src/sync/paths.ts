import { normalizeRelPath } from '../crypto/docid';

/**
 * Пути внутри подключения считаются от его папки, а не от корня хранилища:
 * так участники монтируют одно пространство в разные локальные папки.
 * Имена конфликтных копий живут в conflicts/naming и здесь не повторяются.
 */

/**
 * Расширения, которые пишутся через vault.modify текстом: у открытого редактора
 * так корректно обновляется содержимое. Всё прочее идёт двоичной записью.
 */
export const TEXT_EXTENSIONS = ['md', 'txt', 'canvas', 'json', 'css', 'svg'] as const;

export function isTextPath(relPath: string): boolean {
  const ext = relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase();
  return (TEXT_EXTENSIONS as readonly string[]).includes(ext);
}

/** Путь от корня хранилища для файла подключения. */
export function vaultPath(folder: string, relPath: string): string {
  const base = normalizeRelPath(folder);
  return base === '' ? relPath : `${base}/${relPath}`;
}

/** Путь внутри подключения; null — файл вне его папки. */
export function relativePath(folder: string, path: string): string | null {
  const base = normalizeRelPath(folder);
  const normalized = normalizeRelPath(path);
  if (normalized === '') return null;
  if (base === '') return normalized;
  if (!normalized.startsWith(`${base}/`)) return null;
  const relPath = normalized.slice(base.length + 1);
  return relPath === '' ? null : relPath;
}
