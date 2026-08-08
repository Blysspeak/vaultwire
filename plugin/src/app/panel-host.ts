import type { DocId, SpaceId } from '@vaultwire/shared';
import type { App } from 'obsidian';
import { ObsidianConflictFiles } from '../conflicts/vault-files';
import { ObsidianVaultGateway } from '../engine/vault-gateway';
import { GatewayRestoreVault, readBinaryFromVault } from '../history/vault-restore';
import { listTrash, restoreFromTrash } from '../history/trash';
import type { TrashItem } from '../history/trash';
import type { SyncManager } from '../sync';
import { relativePath, vaultPath } from '../sync/paths';
import type { StatusStore } from '../ui/panel/store';
import type { PanelActions, PanelHost } from '../ui/panel/types';
import { historyDepsOf } from './history-deps';
import type { ConflictRegistries } from './registries';

export interface PanelHostDeps {
  readonly app: App;
  /** Движок поднимается на готовой раскладке, панель может открыться раньше. */
  readonly manager: () => SyncManager | null;
  readonly store: StatusStore;
  readonly registries: ConflictRegistries;
  /** Мастера и модальные окна: панель их только зовёт. */
  readonly actions: PanelActions;
}

/** Всё, что панель просит у плагина. Сама она не знает ни о реестре, ни о клиенте. */
export function createPanelHost(deps: PanelHostDeps): PanelHost {
  const files = new ObsidianConflictFiles(deps.app);
  const restoreVault = new GatewayRestoreVault(
    new ObsidianVaultGateway(deps.app),
    readBinaryFromVault(deps.app),
  );

  const run = async (action: (manager: SyncManager) => Promise<void> | void): Promise<void> => {
    const manager = deps.manager();
    if (manager === null) return;
    await action(manager);
    deps.store.publish();
  };

  return {
    actions: deps.actions,
    status: () => deps.store.status,
    subscribe: (listener) => deps.store.subscribe(listener),
    report: (spaceId) => deps.manager()?.connection(spaceId)?.lastReport ?? null,
    author: (spaceId, path) => authorOf(deps, spaceId, path),
    // Точечного повтора одного документа в очереди нет: повторяем весь прогон.
    retry: (spaceId) =>
      run(async (manager) => {
        await manager.syncNow(spaceId);
      }),
    conflicts: (spaceId) => deps.registries.get(spaceId)?.all() ?? [],
    keepMine: async (spaceId, docId) => {
      await resolveConflictRecord(deps, spaceId, docId, true, files);
    },
    keepServer: async (spaceId, docId) => {
      await resolveConflictRecord(deps, spaceId, docId, false, files);
    },
    trash: (spaceId) => loadTrash(deps, spaceId),
    restore: (spaceId, item) => restore(deps, spaceId, item, restoreVault),
  };
}

/** Автор берётся из индекса: в самих заметках никаких пометок не заводится. */
function authorOf(deps: PanelHostDeps, spaceId: SpaceId, path: string): string | null {
  const connection = deps.manager()?.connection(spaceId);
  if (connection === undefined) return null;
  const relPath = relativePath(connection.folder, path);
  return relPath === null ? null : (connection.index.get(relPath)?.lastAuthor ?? null);
}

async function resolveConflictRecord(
  deps: PanelHostDeps,
  spaceId: SpaceId,
  docId: DocId,
  mine: boolean,
  files: ObsidianConflictFiles,
): Promise<void> {
  const registry = deps.registries.get(spaceId);
  if (registry === undefined) return;
  if (mine) await registry.keepMine(files, docId);
  else await registry.keepServer(files, docId);
  // Решение это обычная локальная правка: она уедет на сервер следующим прогоном.
  await deps.manager()?.syncNow(spaceId);
  deps.store.publish();
}

async function loadTrash(deps: PanelHostDeps, spaceId: SpaceId): Promise<readonly TrashItem[]> {
  const manager = deps.manager();
  const history = manager === null ? null : historyDepsOf(manager, spaceId);
  return history === null ? [] : listTrash(history);
}

async function restore(
  deps: PanelHostDeps,
  spaceId: SpaceId,
  item: TrashItem,
  vault: GatewayRestoreVault,
): Promise<void> {
  const manager = deps.manager();
  if (manager === null || item.path === null) return;
  const connection = manager.connection(spaceId);
  const history = historyDepsOf(manager, spaceId);
  if (connection === undefined || history === null) return;
  await restoreFromTrash(history, vault, item, vaultPath(connection.folder, item.path), Date.now());
  await manager.syncNow(spaceId);
  deps.store.publish();
}
