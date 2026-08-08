import type { SyncOp } from '../../engine/ops';
import { t } from '../../i18n/ru';

/** Сколько путей показывает экран предпросмотра (раздел 8). */
export const PREVIEW_PATH_LIMIT = 20;

export const PLAN_ENTRY_KINDS = ['pull', 'push', 'trashLocal', 'deleteRemote', 'conflict'] as const;
export type PlanEntryKind = (typeof PLAN_ENTRY_KINDS)[number];

export interface PlanEntry {
  readonly kind: PlanEntryKind;
  readonly path: string;
}

/** Сводка плана: то, что человек видит до первой записи на диск. */
export interface PlanSummary {
  readonly incoming: number;
  readonly outgoing: number;
  readonly conflicts: number;
  /** Удалится локально: сервер знает о надгробии. */
  readonly localDeletes: number;
  /** Уйдёт удалением на сервер. */
  readonly remoteDeletes: number;
  /** Объём передачи, байты: тела принимаемых и отправляемых файлов. */
  readonly bytes: number;
  readonly total: number;
  /** Первые PREVIEW_PATH_LIMIT путей в порядке плана. */
  readonly entries: readonly PlanEntry[];
}

/** Чистый пересчёт операций в сводку: одинаковый вход даёт одинаковый экран. */
export function summarizePlan(
  ops: readonly SyncOp[],
  limit: number = PREVIEW_PATH_LIMIT,
): PlanSummary {
  let incoming = 0;
  let outgoing = 0;
  let conflicts = 0;
  let localDeletes = 0;
  let remoteDeletes = 0;
  let bytes = 0;
  const entries: PlanEntry[] = [];

  for (const op of ops) {
    let kind: PlanEntryKind;
    if (op.kind === 'pull') {
      incoming += 1;
      bytes += op.remote.size;
      kind = 'pull';
    } else if (op.kind === 'push' || op.kind === 'move') {
      outgoing += 1;
      bytes += op.local.size;
      kind = 'push';
    } else if (op.kind === 'conflict') {
      conflicts += 1;
      // Конфликт переносит обе стороны: серверную в основной путь, локальную в копию.
      bytes += op.remote.size + (op.local?.size ?? 0);
      kind = 'conflict';
    } else if (op.kind === 'pullDelete') {
      localDeletes += 1;
      kind = 'trashLocal';
    } else if (op.kind === 'pushDelete') {
      remoteDeletes += 1;
      kind = 'deleteRemote';
    } else {
      continue;
    }
    if (entries.length < limit) entries.push({ kind, path: op.path });
  }

  const total = incoming + outgoing + conflicts + localDeletes + remoteDeletes;
  return { incoming, outgoing, conflicts, localDeletes, remoteDeletes, bytes, total, entries };
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Объём человеку: единицы из словаря, число с одним знаком после запятой. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return t('unit.gb', { count: round(bytes / GB) });
  if (bytes >= MB) return t('unit.mb', { count: round(bytes / MB) });
  if (bytes >= KB) return t('unit.kb', { count: round(bytes / KB) });
  return t('unit.b', { count: Math.max(0, Math.round(bytes)) });
}

function round(value: number): number {
  return Number(value.toFixed(1));
}
