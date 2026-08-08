import { t } from '../../../i18n/ru';
import type { ConnectionStatus } from '../../../sync/status';
import { formatMoment, joinMeta } from '../render';

/** Строка состояния активного подключения: состояние словами и счётчики. */
export interface StateLine {
  update(status: ConnectionStatus): void;
}

export function createStateLine(parent: HTMLElement): StateLine {
  const root = parent.createDiv({ cls: 'vw-head-state' });
  const badge = root.createSpan({ cls: 'vw-head-badge' });
  const meta = root.createSpan({ cls: 'vw-head-meta' });
  const awaiting = parent.createDiv({ cls: 'vw-head-awaiting', text: t('activity.awaiting') });

  const update = (status: ConnectionStatus): void => {
    badge.setText(t(`state.${status.state}`));
    meta.setText(
      joinMeta([
        t('panel.head.lastRun', { when: formatMoment(status.lastSyncedAt) }),
        t('panel.head.queue', { count: status.pending }),
        t('panel.head.conflicts', { count: status.conflicts }),
      ]),
    );
    awaiting.toggle(status.awaitingConfirmation);
  };

  return { update };
}
