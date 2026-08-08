/** Построчная разница base → side в виде замен. Основа трёхстороннего слияния. */

/** Замена участка базового текста строками одной из сторон. */
export interface Hunk {
  readonly baseStart: number;
  readonly baseLen: number;
  readonly lines: readonly string[];
}

/** Потолок таблицы LCS в ячейках: миллион это четыре мегабайта, выше слияние отказывает. */
export const DIFF_MAX_CELLS = 1_000_000;

/** null — тексты слишком крупные для таблицы LCS. */
export function diffHunks(base: readonly string[], side: readonly string[]): Hunk[] | null {
  const prefix = commonPrefix(base, side);
  const suffix = commonSuffix(base, side, prefix);
  const baseMid = base.slice(prefix, base.length - suffix);
  const sideMid = side.slice(prefix, side.length - suffix);
  if (baseMid.length === 0 && sideMid.length === 0) return [];
  if (baseMid.length === 0) return [{ baseStart: prefix, baseLen: 0, lines: sideMid }];
  if (sideMid.length === 0) return [{ baseStart: prefix, baseLen: baseMid.length, lines: [] }];
  if (baseMid.length * sideMid.length > DIFF_MAX_CELLS) return null;
  return walk(baseMid, sideMid, lcsTable(baseMid, sideMid), prefix);
}

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/** Хвост считается после отрезанного начала, иначе короткие тексты пересчитаются дважды. */
function commonSuffix(a: readonly string[], b: readonly string[], from: number): number {
  const max = Math.min(a.length, b.length) - from;
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

/** table[i * (m + 1) + j] — длина наибольшей общей подпоследовательности хвостов. */
function lcsTable(base: readonly string[], side: readonly string[]): Int32Array {
  const m = side.length;
  const table = new Int32Array((base.length + 1) * (m + 1));
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const at = i * (m + 1) + j;
      table[at] =
        base[i] === side[j]
          ? (table[at + m + 2] ?? 0) + 1
          : Math.max(table[at + m + 1] ?? 0, table[at + 1] ?? 0);
    }
  }
  return table;
}

/** Проход по таблице от начала: совпадение закрывает текущую замену, расхождение копит её. */
function walk(
  base: readonly string[],
  side: readonly string[],
  table: Int32Array,
  offset: number,
): Hunk[] {
  const n = base.length;
  const m = side.length;
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let start = 0;
  let removed = 0;
  let added: string[] = [];

  const flush = (): void => {
    if (removed > 0 || added.length > 0) {
      hunks.push({ baseStart: offset + start, baseLen: removed, lines: added });
    }
    added = [];
    removed = 0;
  };

  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    if (removed === 0 && added.length === 0) start = i;
    const down = i < n ? (table[(i + 1) * (m + 1) + j] ?? 0) : -1;
    const right = j < m ? (table[i * (m + 1) + j + 1] ?? 0) : -1;
    if (right >= down) {
      added.push(side[j] ?? '');
      j += 1;
    } else {
      removed += 1;
      i += 1;
    }
  }
  flush();
  return hunks;
}
