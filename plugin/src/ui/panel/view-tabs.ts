import type { SpaceId } from '@vaultwire/shared';
import type { App } from 'obsidian';
import type { ConnectionStatus } from '../../sync/status';
import { createActivityTab } from './tab-activity';
import { createConflictsTab } from './tab-conflicts';
import { createTrashTab } from './tab-trash';
import type { PanelHost, PanelTab, PanelTabView } from './types';

/** Участники видны только владельцу; прочие вкладки — при живом подключении. */
export function tabVisible(tab: PanelTab, connection: ConnectionStatus | null): boolean {
  if (connection === null) return false;
  if (tab === 'members') return connection.role === 'owner';
  return true;
}

/**
 * Вкладка активного подключения. Участники приходят из app-слоя: им нужен клиент
 * пространства, о котором панель ничего не знает.
 */
export function createTab(
  tab: PanelTab,
  host: PanelHost,
  app: App,
  spaceId: SpaceId,
): PanelTabView | null {
  if (tab === 'conflicts') return createConflictsTab(host, app);
  if (tab === 'trash') return createTrashTab(host);
  if (tab === 'members') return host.actions.createMembersTab(spaceId);
  return createActivityTab(host);
}
