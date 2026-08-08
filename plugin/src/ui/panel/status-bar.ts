import { setIcon, type IconName } from 'obsidian';
import { t } from '../../i18n/ru';
import type { FileSyncStatus } from '../../sync/file-status';
import type { SyncStatus } from '../../sync/status';
import type { ConnectionState } from '../../sync/types';
import { formatRelativeTime } from '../relative-time';
import { joinMeta } from './render';

/** Иконка на состояние подключения. Только имена из набора Obsidian. */
export const STATE_ICONS: Record<ConnectionState, IconName> = {
  idle: 'check',
  syncing: 'refresh-cw',
  offline: 'cloud-off',
  error: 'alert-triangle',
  readonly: 'eye',
  revoked: 'ban',
  paused: 'pause',
};

/**
 * Элемент строки состояния: иконка и состояние. Клик вешает вызывающий через
 * registerDomEvent — здесь только отрисовка.
 */
export class VaultwireStatusBar {
  private readonly icon: HTMLElement;
  private readonly label: HTMLElement;

  constructor(private readonly el: HTMLElement) {
    el.empty();
    el.addClass('vw-status');
    this.icon = el.createSpan({ cls: 'vw-status-icon' });
    this.label = el.createSpan({ cls: 'vw-status-text' });
  }

  /**
   * Активный файл вытесняет общее состояние: человеку важнее судьба открытой
   * заметки, а общее состояние остаётся в панели. null — файл вне подключений.
   */
  render(status: SyncStatus, file: FileSyncStatus | null = null, now: number = Date.now()): void {
    if (status.connections.length === 0) {
      this.show(STATE_ICONS.idle, t('statusbar.none'));
      return;
    }
    if (file !== null) {
      this.show(fileIcon(file), fileText(file, now));
      return;
    }
    this.show(
      STATE_ICONS[status.state],
      joinMeta([
        t(`state.${status.state}`),
        status.pending === 0 ? null : t('statusbar.pending', { count: status.pending }),
        status.connections.some((item) => item.awaitingConfirmation)
          ? t('statusbar.awaiting')
          : null,
      ]),
    );
  }

  private show(icon: IconName, text: string): void {
    setIcon(this.icon, icon);
    this.label.setText(text);
    this.el.setAttr('aria-label', text);
  }
}

function fileIcon(file: FileSyncStatus): IconName {
  if (file.kind === 'pending') return 'refresh-cw';
  return file.kind === 'received' ? 'download' : 'check';
}

function fileText(file: FileSyncStatus, now: number): string {
  if (file.kind === 'pending') return t('statusbar.file.pending');
  const when = file.at === null ? t('time.now') : formatRelativeTime(file.at, now);
  if (file.kind === 'received' && file.author !== null) {
    return t('statusbar.file.author', { author: file.author, when });
  }
  return t('statusbar.file.synced', { when });
}
