import type { SpaceId } from '@vaultwire/shared';
import type { SyncStatus } from '../../../sync/status';
import { pickConnection } from '../scope';
import type { PanelActions } from '../types';
import { createHeadButtons } from './buttons';
import { createPicker } from './picker';
import { createStateLine } from './state-line';

/**
 * Шапка панели: выбор активного подключения, его состояние и кнопки управления.
 * Живёт над вкладками и не уезжает вместе со списком при прокрутке.
 */
export interface PanelHeader {
  readonly el: HTMLElement;
  update(status: SyncStatus, active: SpaceId | null): void;
}

export function createHeader(
  parent: HTMLElement,
  actions: PanelActions,
  onPick: (spaceId: SpaceId) => void,
): PanelHeader {
  const el = parent.createDiv({ cls: 'vw-panel-head' });
  const top = el.createDiv({ cls: 'vw-head-top' });
  const picker = createPicker(top, onPick);
  const buttons = createHeadButtons(top, actions);
  const state = createStateLine(el);

  const update = (status: SyncStatus, active: SpaceId | null): void => {
    const connection = pickConnection(status, active);
    el.toggle(connection !== null);
    if (connection === null) return;
    picker.update(status.connections, active);
    state.update(connection);
    buttons.update(connection);
  };

  return { el, update };
}
