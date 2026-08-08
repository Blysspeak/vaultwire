import type { Hunk } from './lcs';
import { diffHunks } from './lcs';

/** Трёхстороннее построчное слияние. Чистый модуль, о markdown ничего не знает. */

export const MERGE_FAILURES = ['overlap', 'too-large'] as const;
export type MergeFailure = (typeof MERGE_FAILURES)[number];

export type Merge3Result =
  | { readonly ok: true; readonly lines: readonly string[]; readonly hunks: readonly Hunk[] }
  | { readonly ok: false; readonly failure: MergeFailure };

/** Разбиение без потерь: обратная склейка через joinLines даёт исходный текст. */
export function splitLines(text: string): string[] {
  return text.split('\n');
}

export function joinLines(lines: readonly string[]): string {
  return lines.join('\n');
}

/**
 * Правки сторон применяются к базе, пока они не пересекаются. Пересечение
 * построчно неразрешимо, поэтому документ уходит в конфликтную копию.
 */
export function merge3(
  base: readonly string[],
  mine: readonly string[],
  theirs: readonly string[],
): Merge3Result {
  const mineHunks = diffHunks(base, mine);
  const theirsHunks = diffHunks(base, theirs);
  if (mineHunks === null || theirsHunks === null) return { ok: false, failure: 'too-large' };
  const ordered = combine(mineHunks, theirsHunks);
  if (ordered === null) return { ok: false, failure: 'overlap' };
  return { ok: true, lines: build(base, ordered), hunks: ordered };
}

/** null — стороны тронули один участок по-разному. Одинаковая правка применяется однажды. */
function combine(mine: readonly Hunk[], theirs: readonly Hunk[]): Hunk[] | null {
  const result: Hunk[] = [...mine];
  for (const hunk of theirs) {
    const clash = mine.find((other) => overlaps(other, hunk));
    if (clash === undefined) {
      result.push(hunk);
      continue;
    }
    if (!identical(clash, hunk)) return null;
  }
  return result.sort((a, b) => a.baseStart - b.baseStart || a.baseLen - b.baseLen);
}

/**
 * Вставки в одну точку считаются столкновением: порядок строк выбрать неоткуда.
 * Вставка ровно на границе заменённого участка столкновением не считается.
 */
function overlaps(a: Hunk, b: Hunk): boolean {
  if (a.baseLen === 0 && b.baseLen === 0) return a.baseStart === b.baseStart;
  return a.baseStart < b.baseStart + b.baseLen && b.baseStart < a.baseStart + a.baseLen;
}

function identical(a: Hunk, b: Hunk): boolean {
  return (
    a.baseStart === b.baseStart &&
    a.baseLen === b.baseLen &&
    a.lines.length === b.lines.length &&
    a.lines.every((line, at) => line === b.lines[at])
  );
}

function build(base: readonly string[], hunks: readonly Hunk[]): string[] {
  const out: string[] = [];
  let pos = 0;
  for (const hunk of hunks) {
    for (let i = pos; i < hunk.baseStart; i += 1) out.push(base[i] ?? '');
    for (const line of hunk.lines) out.push(line);
    pos = Math.max(pos, hunk.baseStart + hunk.baseLen);
  }
  for (let i = pos; i < base.length; i += 1) out.push(base[i] ?? '');
  return out;
}
