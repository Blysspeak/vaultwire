import { setIcon, type IconName } from 'obsidian';
import { t } from '../../i18n/ru';
import type { SyncStatus } from '../../sync/status';
import type { ConnectionState } from '../../sync/types';
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

  render(status: SyncStatus): void {
    if (status.connections.length === 0) {
      setIcon(this.icon, STATE_ICONS.idle);
      this.label.setText(t('statusbar.none'));
      this.el.setAttr('aria-label', t('statusbar.none'));
      return;
    }
    setIcon(this.icon, STATE_ICONS[status.state]);
    const text = joinMeta([
      t(`state.${status.state}`),
      status.pending === 0 ? null : t('statusbar.pending', { count: status.pending }),
      status.connections.some((item) => item.awaitingConfirmation) ? t('statusbar.awaiting') : null,
    ]);
    this.label.setText(text);
    this.el.setAttr('aria-label', text);
  }
}
