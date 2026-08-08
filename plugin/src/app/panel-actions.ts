import type { SpaceId } from '@vaultwire/shared';
import { obsidianRequest } from '../api/request';
import { requireManager } from '../settings/actions';
import type { ConnectionsDeps } from '../settings/actions';
import {
  configureConnection,
  disconnectConnection,
  setConnectionPaused,
  syncConnection,
} from '../settings/connection-actions';
import type { ConnectionSettings } from '../settings/types';
import { CreateSpaceModal } from '../ui/owner/create-space';
import { MembersTab } from '../ui/owner/members';
import type { PanelActions, PanelTabView } from '../ui/panel/types';
import { openPluginSettings } from './plugin-settings';
import { createSettingsActions, openConnectSpace } from './settings-actions';
import type { ActionsDeps } from './settings-actions';

export interface PanelActionsDeps extends ActionsDeps {
  /** manifest.id: по нему открывается вкладка настроек плагина. */
  readonly pluginId: string;
}

/**
 * Оперативные действия панели. Ничего нового здесь не пишется: мастера,
 * модальные окна и правка подключений переиспользуются как есть.
 */
export function createPanelActions(deps: PanelActionsDeps): PanelActions {
  const conn = connectionsDeps(deps);
  const on = (spaceId: SpaceId, run: (connection: ConnectionSettings) => void): void => {
    const connection = deps.settings.connections.find((item) => item.spaceId === spaceId);
    if (connection !== undefined) run(connection);
  };

  return {
    canCreateSpace: () => deps.settings.bootstrapToken.length > 0,
    connectSpace: () => {
      openConnectSpace(deps);
    },
    createSpace: () => {
      openCreateSpace(conn);
    },
    sync: (spaceId) => {
      on(spaceId, (connection) => {
        syncConnection(conn, connection);
      });
    },
    setPaused: (spaceId, paused) => {
      on(spaceId, (connection) => {
        setConnectionPaused(conn, connection, paused);
      });
    },
    configure: (spaceId) => {
      on(spaceId, (connection) => {
        configureConnection(conn, connection);
      });
    },
    disconnect: (spaceId) => {
      on(spaceId, (connection) => {
        disconnectConnection(conn, connection);
      });
    },
    openPluginSettings: () => {
      openPluginSettings(deps.app, deps.pluginId);
    },
    createMembersTab: (spaceId) => membersTab(deps, spaceId),
  };
}

function connectionsDeps(deps: PanelActionsDeps): ConnectionsDeps {
  return {
    app: deps.app,
    settings: deps.settings,
    actions: createSettingsActions(deps),
    save: () => deps.save(),
    refresh: deps.refresh,
  };
}

function openCreateSpace(deps: ConnectionsDeps): void {
  const manager = requireManager(deps);
  if (manager === null) return;
  new CreateSpaceModal(deps.app, {
    request: obsidianRequest,
    settings: deps.settings,
    manager,
    savedToken: deps.settings.bootstrapToken,
    save: () => deps.save(),
    onCreated: () => {
      deps.refresh();
    },
  }).open();
}

/** Вкладка участников собирается на клиенте подключения: без движка её нет. */
function membersTab(deps: PanelActionsDeps, spaceId: SpaceId): PanelTabView | null {
  const connection = deps.manager()?.connection(spaceId);
  if (connection === undefined) return null;
  return new MembersTab({
    app: deps.app,
    client: connection.client,
    connection: connection.settings,
    log: deps.log,
    save: () => deps.save(),
  });
}
