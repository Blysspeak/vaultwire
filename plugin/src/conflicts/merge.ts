import type { DocId, Rev } from '@vaultwire/shared';
import { listRevisions, loadRevisionText } from '../history/revisions';
import type { HistoryDeps } from '../history/types';
import { joinLines, merge3, splitLines } from './diff3';
import { frontmatterEndLine } from './frontmatter';

/**
 * Автослияние markdown из раздела 7. Базовый текст берётся с сервера по rev из
 * индекса: сервер хранит историю, поэтому локальные базовые копии не нужны.
 */

/**
 * Причины отказа. Два жёстких: бинарные файлы и любое пересечение с областью
 * frontmatter. Остальные — техническая невозможность слить построчно.
 */
export const MERGE_REFUSALS = [
  'binary',
  'not-markdown',
  'no-base',
  'frontmatter',
  'overlap',
  'too-large',
] as const;
export type MergeRefusal = (typeof MERGE_REFUSALS)[number];

export type MergeOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly refusal: MergeRefusal };

export interface MergeInput {
  /** Путь нужен только для проверки расширения. */
  readonly path: string;
  /** Текст ревизии, от которой разошлись стороны; null — базы нет. */
  readonly base: string | null;
  readonly local: string | ArrayBuffer;
  readonly remote: string | ArrayBuffer;
  /** Конец области frontmatter локального файла по metadataCache, строк; 0 — нет. */
  readonly localFrontmatterEnd: number;
}

/** Чистая функция: весь ввод-вывод остался в loadBaseText и в вызывающем. */
export function mergeMarkdown(input: MergeInput): MergeOutcome {
  if (!isMarkdownPath(input.path)) return { ok: false, refusal: 'not-markdown' };
  if (typeof input.local !== 'string' || typeof input.remote !== 'string') {
    return { ok: false, refusal: 'binary' };
  }
  if (input.base === null) return { ok: false, refusal: 'no-base' };
  if (isBinaryText(input.base) || isBinaryText(input.local) || isBinaryText(input.remote)) {
    return { ok: false, refusal: 'binary' };
  }

  const base = splitLines(input.base);
  const merged = merge3(base, splitLines(input.local), splitLines(input.remote));
  if (!merged.ok) return { ok: false, refusal: merged.failure };

  const guard = frontmatterGuard(input);
  // Замена, начавшаяся внутри области frontmatter или прямо перед ней, её задела.
  if (guard > 0 && merged.hunks.some((hunk) => hunk.baseStart < guard)) {
    return { ok: false, refusal: 'frontmatter' };
  }
  return { ok: true, text: joinLines(merged.lines) };
}

/**
 * Базовый текст с сервера по rev из индекса. null — ревизии уже нет:
 * история подрезана сроком хранения, слить не от чего.
 */
export async function loadBaseText(
  deps: HistoryDeps,
  docId: DocId,
  rev: Rev,
): Promise<string | null> {
  const revisions = await listRevisions(deps, docId);
  const base = revisions.find((item) => item.rev === rev);
  if (base === undefined || base.blobHash === null) return null;
  return loadRevisionText(deps, base.blobHash);
}

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/** Нулевой байт в тексте означает, что перед нами не текст. */
function isBinaryText(text: string): boolean {
  return text.includes('\u0000');
}

/** Область защищается по самой длинной из трёх версий: границы могли разъехаться. */
function frontmatterGuard(input: MergeInput): number {
  const local = typeof input.local === 'string' ? frontmatterEndLine(input.local) : 0;
  const remote = typeof input.remote === 'string' ? frontmatterEndLine(input.remote) : 0;
  const base = input.base === null ? 0 : frontmatterEndLine(input.base);
  return Math.max(input.localFrontmatterEnd, local, remote, base);
}
