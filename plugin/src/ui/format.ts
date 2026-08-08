import { t } from '../i18n/ru';

/** Момент времени человеку; null — события ещё не было. */
export function formatMoment(at: number | null): string {
  return at === null ? t('settings.connections.never') : new Date(at).toLocaleString();
}

/** Текст ошибки для строки состояния окна: сообщение как есть, без стека. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
