import type { SpaceId } from '@vaultwire/shared';
import { t } from '../../../i18n/ru';
import type { ConnectionStatus } from '../../../sync/status';
import { iconButton } from '../icon-button';
import type { PanelActions } from '../types';

/** Кнопки-иконки шапки: прогон, пауза, настройки подключения, отключение. */
export interface HeadButtons {
  update(status: ConnectionStatus): void;
}

export function createHeadButtons(parent: HTMLElement, actions: PanelActions): HeadButtons {
  const root = parent.createDiv({ cls: 'vw-head-actions' });
  // Подключение читается из последнего обновления, а не из замыкания: в шапке
  // оно меняется селектором, а кнопки при этом остаются те же самые.
  let space: SpaceId | null = null;
  let paused = false;

  const on = (run: (spaceId: SpaceId) => void): (() => void) => {
    return () => {
      if (space !== null) run(space);
    };
  };

  iconButton(
    root,
    'refresh-cw',
    t('activity.syncNow'),
    on((spaceId) => {
      actions.sync(spaceId);
    }),
  );
  const toggle = iconButton(
    root,
    'pause',
    t('activity.pause'),
    on((spaceId) => {
      actions.setPaused(spaceId, !paused);
    }),
  );
  iconButton(
    root,
    'settings',
    t('settings.connections.configure'),
    on((spaceId) => {
      actions.configure(spaceId);
    }),
  );
  iconButton(
    root,
    'unplug',
    t('settings.connections.disconnect'),
    on((spaceId) => {
      actions.disconnect(spaceId);
    }),
  );

  const update = (status: ConnectionStatus): void => {
    space = status.spaceId;
    paused = status.state === 'paused';
    if (paused) toggle.set('play', t('activity.resume'));
    else toggle.set('pause', t('activity.pause'));
  };

  return { update };
}
