import { t } from '../../i18n/ru';
import type { ConnectionStatus } from '../../sync/status';
import { actionButton, formatMoment, infoRow, note } from './render';
import type { PanelHost } from './types';

/** Карточка одного подключения: состояние, счётчики и две кнопки управления. */
export interface ConnectionCard {
  update(status: ConnectionStatus): void;
}

export function renderConnectionCard(
  parent: HTMLElement,
  initial: ConnectionStatus,
  host: PanelHost,
): ConnectionCard {
  const spaceId = initial.spaceId;
  const card = parent.createDiv({ cls: 'vw-card' });
  const head = card.createDiv({ cls: 'vw-card-head' });
  const title = head.createDiv({ cls: 'vw-card-title' });
  const badge = head.createSpan({ cls: 'vw-card-badge' });

  const queue = infoRow(card, t('activity.queue'));
  const conflicts = infoRow(card, t('activity.conflicts'));
  const lastRun = infoRow(card, t('activity.lastRun'));
  const awaiting = note(card, t('activity.awaiting'));

  const actions = card.createDiv({ cls: 'vw-card-actions' });
  actionButton(actions, t('activity.syncNow'), () => host.syncNow(spaceId));

  // Состояние паузы читается из последнего обновления, а не из замыкания:
  // подключение могли остановить командой, минуя эту кнопку.
  let paused = initial.state === 'paused';
  const toggle = actionButton(actions, t('activity.pause'), () => {
    if (paused) host.resume(spaceId);
    else host.pause(spaceId);
  });

  const update = (status: ConnectionStatus): void => {
    paused = status.state === 'paused';
    title.setText(status.label.length > 0 ? status.label : status.spaceId);
    badge.setText(t(`state.${status.state}`));
    queue.setText(String(status.pending));
    conflicts.setText(String(status.conflicts));
    lastRun.setText(formatMoment(status.lastSyncedAt));
    awaiting.toggle(status.awaitingConfirmation);
    toggle.setButtonText(paused ? t('activity.resume') : t('activity.pause'));
  };

  update(initial);
  return { update };
}
