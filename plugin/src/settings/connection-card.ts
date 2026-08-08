import { ButtonComponent } from 'obsidian';
import { t } from '../i18n/ru';
import type { ConnectionState } from '../sync';
import { serverHost } from '../ui/connect/code';
import { formatMoment } from '../ui/format';
import type { ConnectionsDeps } from './actions';
import {
  configureConnection,
  disconnectConnection,
  syncConnection,
  toggleConnection,
} from './connection-actions';
import type { ConnectionSettings } from './types';

/** Карточка подключения: сводка сверху, управление снизу (раздел 8). */
export function renderConnectionCard(
  list: HTMLElement,
  connection: ConnectionSettings,
  deps: ConnectionsDeps,
): void {
  const card = list.createDiv({ cls: 'vw-card' });
  card.createDiv({ cls: 'vw-card-title', text: connection.label || connection.spaceId });
  for (const [key, value] of summary(connection, deps)) {
    const row = card.createDiv({ cls: 'vw-card-row' });
    row.createSpan({ cls: 'vw-card-key', text: key });
    row.createSpan({ cls: 'vw-card-value', text: value });
  }
  renderButtons(card.createDiv({ cls: 'vw-card-actions' }), connection, deps);
}

function summary(
  connection: ConnectionSettings,
  deps: ConnectionsDeps,
): ReadonlyArray<readonly [string, string]> {
  return [
    [
      t('settings.connections.folder'),
      connection.localFolder || t('settings.connections.folderRoot'),
    ],
    [t('settings.connections.server'), serverHost(connection.serverUrl)],
    [t('settings.connections.role'), t(`role.${connection.role}`)],
    [t('settings.connections.state'), t(`state.${stateOf(connection, deps)}`)],
    [t('settings.connections.lastSync'), formatMoment(connection.lastSyncedAt)],
    [t('settings.connections.spaceId'), connection.spaceId],
  ];
}

/**
 * Живое состояние берётся у реестра; без движка остаётся то, что известно из
 * настроек: выключенная автосинхронизация это пауза, всё прочее — ожидание.
 */
function stateOf(connection: ConnectionSettings, deps: ConnectionsDeps): ConnectionState {
  const state = deps.actions.manager()?.connection(connection.spaceId)?.state;
  if (state !== undefined) return state;
  return connection.autoSync ? 'idle' : 'paused';
}

function renderButtons(
  actions: HTMLElement,
  connection: ConnectionSettings,
  deps: ConnectionsDeps,
): void {
  new ButtonComponent(actions).setButtonText(t('settings.connections.sync')).onClick(() => {
    syncConnection(deps, connection);
  });
  new ButtonComponent(actions)
    .setButtonText(
      connection.autoSync ? t('settings.connections.pause') : t('settings.connections.resume'),
    )
    .onClick(() => {
      toggleConnection(deps, connection);
    });
  new ButtonComponent(actions).setButtonText(t('settings.connections.configure')).onClick(() => {
    configureConnection(deps, connection);
  });
  new ButtonComponent(actions)
    .setButtonText(t('settings.connections.disconnect'))
    .setWarning()
    .onClick(() => {
      disconnectConnection(deps, connection);
    });
}
