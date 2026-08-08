import { t } from '../i18n/ru';
import type { ConnectionSettings } from './types';

/** Список подключений карточками, только для чтения (раздел 8). */
export function renderConnectionsList(
  root: HTMLElement,
  connections: readonly ConnectionSettings[],
): void {
  const list = root.createDiv({ cls: 'vw-connections' });
  if (connections.length === 0) {
    list.createDiv({ cls: 'vw-connections-empty', text: t('settings.connections.empty') });
    return;
  }
  for (const connection of connections) renderCard(list, connection);
}

function renderCard(list: HTMLElement, connection: ConnectionSettings): void {
  const card = list.createDiv({ cls: 'vw-card' });
  card.createDiv({ cls: 'vw-card-title', text: connection.label || connection.spaceId });
  const rows: ReadonlyArray<readonly [string, string]> = [
    [
      t('settings.connections.folder'),
      connection.localFolder || t('settings.connections.folderRoot'),
    ],
    [t('settings.connections.server'), hostOf(connection.serverUrl)],
    [t('settings.connections.role'), t(`role.${connection.role}`)],
    [
      t('settings.connections.lastSync'),
      connection.lastSyncedAt === null
        ? t('settings.connections.never')
        : new Date(connection.lastSyncedAt).toLocaleString(),
    ],
  ];
  for (const [key, value] of rows) {
    const row = card.createDiv({ cls: 'vw-card-row' });
    row.createSpan({ cls: 'vw-card-key', text: key });
    row.createSpan({ cls: 'vw-card-value', text: value });
  }
  if (!connection.autoSync) {
    card.createDiv({ cls: 'vw-card-badge', text: t('settings.connections.paused') });
  }
}

function hostOf(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}
