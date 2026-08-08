import { t } from '../i18n/ru';
import type { FileSyncStatus } from '../sync/file-status';
import { formatRelativeTime } from './relative-time';

/**
 * Текст подписи у заголовка заметки. Вынесен из note-badge.ts, который тянет
 * obsidian: у пакета нет рантайма вне приложения, и тест такой модуль не поднимет.
 */
export function badgeText(status: FileSyncStatus, now: number): string {
  if (status.kind === 'pending') return t('badge.pending');
  const when = status.at === null ? t('time.now') : formatRelativeTime(status.at, now);
  if (status.kind === 'received' && status.author !== null) {
    return t('badge.author', { author: status.author, when });
  }
  return t('badge.synced', { when });
}
