import { NetworkError, UnauthorizedError } from '../api/errors';
import type { ConnectionState } from './types';

/**
 * Разбор ошибки прогона по таблице раздела 3: 401 это отозванный доступ,
 * обрыв транспорта это офлайн, всё прочее это ошибка с баннером.
 */
export function stateForError(error: unknown): ConnectionState {
  if (error instanceof UnauthorizedError) return 'revoked';
  if (error instanceof NetworkError) return 'offline';
  return 'error';
}

export function reasonForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
