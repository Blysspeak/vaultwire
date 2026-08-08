import { t } from '../i18n/ru';
import type { ConnectionsDeps } from './actions';
import { renderConnectionCard } from './connection-card';

/** Список подключений карточками с управлением (раздел 8). */
export function renderConnectionsList(root: HTMLElement, deps: ConnectionsDeps): void {
  const list = root.createDiv({ cls: 'vw-connections' });
  const connections = deps.settings.connections;
  if (connections.length === 0) {
    list.createDiv({ cls: 'vw-connections-empty', text: t('settings.connections.empty') });
    return;
  }
  for (const connection of connections) renderConnectionCard(list, connection, deps);
}
