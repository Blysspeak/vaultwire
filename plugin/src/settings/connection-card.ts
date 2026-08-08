import { t } from '../i18n/ru';
import type { ConnectionState } from '../sync';
import type { ConnectionsDeps } from './actions';
import type { ConnectionSettings } from './types';

/**
 * Карточка подключения во вкладке настроек: справка только для чтения.
 * Управление переехало в боковую панель, здесь остаётся сводка.
 */
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
    [t('settings.connections.role'), t(`role.${connection.role}`)],
    [t('settings.connections.state'), t(`state.${stateOf(connection, deps)}`)],
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
