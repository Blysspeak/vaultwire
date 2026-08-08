/** Фильтры путей подключения: жёсткие исключения, временные файлы, маски. */

/**
 * Никогда не синхронизируются, независимо от настроек подключения.
 * `.trash` обязателен: иначе удалённые файлы возвращаются как новые (раздел 7).
 */
export const HARD_EXCLUDED_SEGMENTS = ['.obsidian', '.trash', '.git'] as const;

/** Временные файлы редакторов и служебный мусор файловых систем. */
const TEMP_FILE_PATTERNS = [
  /^~\$/,
  /^\.~/,
  /~$/,
  /\.tmp$/i,
  /\.temp$/i,
  /\.crswap$/i,
  /\.swp$/i,
  /^\.DS_Store$/,
  /^Thumbs\.db$/i,
] as const;

export function isHardExcluded(relPath: string): boolean {
  const segments = relPath.split('/');
  return segments.some((segment) => (HARD_EXCLUDED_SEGMENTS as readonly string[]).includes(segment));
}

export function isTempFile(relPath: string): boolean {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  if (name === '') return true;
  return TEMP_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Маска в стиле glob: `**` перекрывает любые символы вместе с разделителем,
 * `*` и `?` — всё кроме разделителя. Маска без разделителя сверяется с именем файла.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i] ?? '';
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesPattern(relPath: string, pattern: string): boolean {
  const regexp = globToRegExp(pattern);
  if (regexp.test(relPath)) return true;
  if (pattern.includes('/')) return false;
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  return regexp.test(name);
}

export function matchesAny(relPath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(relPath, pattern));
}

/** Пустой список включений означает «всё, кроме исключений». */
export function isIncluded(
  relPath: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  if (matchesAny(relPath, exclude)) return false;
  return include.length === 0 || matchesAny(relPath, include);
}
