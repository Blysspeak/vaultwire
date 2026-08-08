import type { MessageKey } from '../i18n/ru';
import { SETTINGS_BOUNDS } from './defaults';
import type { ConflictStrategy, ConnectionSettings } from './types';

export const MB = 1024 * 1024;

export const STRATEGY_KEYS: Record<ConflictStrategy, MessageKey> = {
  copy: 'strategy.copy',
  merge: 'strategy.merge',
  newest: 'strategy.newest',
};

/** Черновик правок: пока не нажата кнопка, подключение не трогается. */
export interface Draft {
  include: string[];
  exclude: string[];
  maxFileBytes: number | null;
  conflictStrategy: ConflictStrategy;
  autoSync: boolean;
}

export function draftOf(connection: ConnectionSettings): Draft {
  return {
    include: [...connection.include],
    exclude: [...connection.exclude],
    maxFileBytes: connection.maxFileBytes,
    conflictStrategy: connection.conflictStrategy,
    autoSync: connection.autoSync,
  };
}

export function applyDraft(connection: ConnectionSettings, draft: Draft): void {
  connection.include = draft.include;
  connection.exclude = draft.exclude;
  connection.maxFileBytes = draft.maxFileBytes;
  connection.conflictStrategy = draft.conflictStrategy;
  connection.autoSync = draft.autoSync;
}

/** Пусто — общий лимит плагина; мусор и выход за границы игнорируются. */
export function parseLimit(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  const bytes = Math.round(Number(text) * MB);
  if (!Number.isFinite(bytes)) return null;
  if (bytes < SETTINGS_BOUNDS.maxFileBytesMin || bytes > SETTINGS_BOUNDS.maxFileBytesMax) {
    return null;
  }
  return bytes;
}
