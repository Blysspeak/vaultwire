import { normalizeRelPath } from '../crypto/docid';
import { isHardExcluded, isIncluded, isTempFile } from './path-filter';
import type { IndexEntry, LocalDelta, LocalFile, SkippedFile } from './types';

/** Достаточная часть TFile: путь и статистика, которые отдаёт vault.getFiles(). */
export interface ScanFile {
  readonly path: string;
  readonly stat: { readonly mtime: number; readonly ctime: number; readonly size: number };
}

export interface ScanOptions {
  /** Корень подключения от корня хранилища; пустая строка — всё хранилище. */
  readonly folder: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  /** Файлы крупнее пропускаются с записью в панель (раздел 6). */
  readonly maxFileBytes: number;
}

/**
 * Полный сверочный скан: ловит правки, сделанные при закрытом Obsidian,
 * и служит основным механизмом на мобильных, где фонового процесса нет.
 */
export function scanConnection(
  files: readonly ScanFile[],
  index: readonly IndexEntry[],
  options: ScanOptions,
): LocalDelta {
  const byPath = new Map(index.map((entry) => [entry.path, entry]));
  const created: LocalFile[] = [];
  const modified: LocalFile[] = [];
  const unchanged: string[] = [];
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  const folder = normalizeRelPath(options.folder);
  let scanned = 0;

  for (const file of sortByPath(files)) {
    const relPath = toRelPath(file.path, folder);
    if (relPath === null || isHardExcluded(relPath) || isTempFile(relPath)) continue;
    seen.add(relPath);
    if (!isIncluded(relPath, options.include, options.exclude)) {
      skipped.push({ path: relPath, size: file.stat.size, reason: 'excluded' });
      continue;
    }
    scanned += 1;
    if (file.stat.size > options.maxFileBytes) {
      skipped.push({ path: relPath, size: file.stat.size, reason: 'too-large' });
      continue;
    }
    const local: LocalFile = {
      path: relPath,
      mtime: file.stat.mtime,
      ctime: file.stat.ctime,
      size: file.stat.size,
    };
    const entry = byPath.get(relPath);
    if (entry === undefined) {
      created.push(local);
    } else if (isTouched(entry, local)) {
      modified.push(local);
    } else {
      unchanged.push(relPath);
    }
  }

  // Пропущенные по фильтру и по размеру не считаются удалёнными: файл на диске есть.
  const deleted = index.map((entry) => entry.path).filter((path) => !seen.has(path)).sort();
  return { created, modified, deleted, unchanged, skipped, scanned };
}

/** Флаг dirty ставится по событию хранилища и переживает перезапуск: правка не отправлена. */
function isTouched(entry: IndexEntry, local: LocalFile): boolean {
  return entry.dirty || entry.mtime !== local.mtime || entry.size !== local.size;
}

/** null — файл вне папки подключения. */
function toRelPath(path: string, folder: string): string | null {
  const normalized = normalizeRelPath(path);
  if (folder === '') return normalized === '' ? null : normalized;
  if (!normalized.startsWith(`${folder}/`)) return null;
  const relPath = normalized.slice(folder.length + 1);
  return relPath === '' ? null : relPath;
}

function sortByPath(files: readonly ScanFile[]): ScanFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
