/**
 * Имя конфликтной копии из раздела 7: «Заметка (конфликт, ноутбук, 2026-08-08 14-30).md».
 * Копия синхронизируется наравне со всем остальным, поэтому имя обязано быть
 * безопасным для любой файловой системы и одинаково читаться на всех устройствах.
 */

/** Слово-маркер в имени. По нему копии находит команда очистки. */
export const CONFLICT_MARKER = 'конфликт';

/** Метка устройства в имени файла: длиннее не влезает в лимит имени на ФС. */
const LABEL_MAX = 40;

/** Запас под метку, отметку времени и номер дубликата в пределах 255 символов имени. */
const STEM_MAX = 120;

/** Запрещённые в именах символы Obsidian и Windows плюс управляющие. */
const UNSAFE = new RegExp('[\\\\/:*?"<>|#^\\[\\]()]|[\\u0000-\\u001f]', 'g');

const COPY_PATTERN = new RegExp(
  ` \\(${CONFLICT_MARKER}, [^()]*, \\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}(?:, \\d+)?\\)$`,
);

/** Метка устройства в имени файла: без разделителей путей, запятых и скобок. */
export function sanitizeLabel(label: string): string {
  const cleaned = label.replace(UNSAFE, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = cleaned.slice(0, LABEL_MAX).trim();
  return cut === '' ? 'устройство' : cut;
}

/** Местное время в виде «2026-08-08 14-30»: двоеточие в именах файлов запрещено. */
export function formatConflictStamp(at: number | Date): string {
  const date = typeof at === 'number' ? new Date(at) : at;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

/**
 * Путь конфликтной копии рядом с исходным файлом. Совпадение имени разрешается
 * номером: две копии за одну минуту иначе затёрли бы друг друга.
 */
export function conflictCopyPath(
  path: string,
  deviceLabel: string,
  at: number | Date,
  exists: (candidate: string) => boolean,
): string {
  const { folder, stem, ext } = splitPath(path);
  const label = sanitizeLabel(deviceLabel);
  const stamp = formatConflictStamp(at);
  const head = stem.slice(0, STEM_MAX);
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `, ${n}`;
    const candidate = `${folder}${head} (${CONFLICT_MARKER}, ${label}, ${stamp}${suffix})${ext}`;
    if (!exists(candidate)) return candidate;
  }
}

/** Копия ли это: по имени, потому что чужие копии приходят синхронизацией. */
export function isConflictCopy(path: string): boolean {
  return COPY_PATTERN.test(splitPath(path).stem);
}

interface PathParts {
  /** Папка вместе с завершающим слэшем; пустая строка — корень. */
  readonly folder: string;
  readonly stem: string;
  /** Расширение с точкой; пустая строка — расширения нет. */
  readonly ext: string;
}

function splitPath(path: string): PathParts {
  const normalized = path.replace(/\\/g, '/');
  const cut = normalized.lastIndexOf('/');
  const folder = cut < 0 ? '' : normalized.slice(0, cut + 1);
  const name = normalized.slice(cut + 1);
  const dot = name.lastIndexOf('.');
  // Ведущая точка это скрытый файл, а не расширение.
  if (dot <= 0) return { folder, stem: name, ext: '' };
  return { folder, stem: name.slice(0, dot), ext: name.slice(dot) };
}
