import { Notice } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { t } from '../i18n/ru';
import type { VaultwireSettings } from '../settings/types';
import type { SyncManager } from '../sync';
import { clearConflictCopies } from './clear-copies';
import { openPanel } from './panel-open';
import type { ConflictRegistries } from './registries';
import { lockedConnections, unlockChain } from './unlock';

export interface CommandDeps {
  readonly app: App;
  readonly plugin: Plugin;
  readonly settings: VaultwireSettings;
  readonly registries: ConflictRegistries;
  /** Движок поднимается на готовой раскладке: до неё команды честно отказывают. */
  manager(): SyncManager | null;
  connect(): void;
  refresh(): void;
}

/** Команды раздела 8. Горячие клавиши по умолчанию не назначаются. */
export function registerCommands(deps: CommandDeps): void {
  const add = (id: string, name: string, run: () => void): void => {
    deps.plugin.addCommand({ id, name, callback: run });
  };

  add('sync-now', t('cmd.syncNow'), () => {
    syncNow(deps);
  });
  add('open-panel', t('cmd.openPanel'), () => {
    void openPanel(deps.app);
  });
  add('show-conflicts', t('cmd.showConflicts'), () => {
    void openPanel(deps.app, 'conflicts');
  });
  add('clear-conflict-copies', t('cmd.clearConflictCopies'), () => {
    void clearCopies(deps);
  });
  add('connect-space', t('cmd.connectSpace'), () => {
    deps.connect();
  });
  add('unlock', t('cmd.unlock'), () => {
    unlock(deps);
  });
}

function syncNow(deps: CommandDeps): void {
  const manager = requireManager(deps);
  if (manager === null) return;
  if (lockedConnections(manager, deps.settings.connections).length > 0) {
    new Notice(t('notice.locked'));
  }
  new Notice(t('notice.syncStarted'));
  void manager.syncNow().then(() => {
    deps.refresh();
  });
}

async function clearCopies(deps: CommandDeps): Promise<void> {
  const manager = requireManager(deps);
  if (manager === null) return;
  const removed = await clearConflictCopies(deps.app, manager, deps.registries);
  new Notice(removed === 0 ? t('notice.noCopies') : t('notice.copiesCleared', { count: removed }));
  deps.refresh();
}

function unlock(deps: CommandDeps): void {
  const manager = requireManager(deps);
  if (manager === null) return;
  const locked = lockedConnections(manager, deps.settings.connections);
  if (locked.length === 0) {
    new Notice(t('notice.allUnlocked'));
    return;
  }
  unlockChain(deps.app, manager, locked, deps.refresh);
}

/** Подключений нет или движок ещё не поднят — команде делать нечего. */
function requireManager(deps: CommandDeps): SyncManager | null {
  if (deps.settings.connections.length === 0) {
    new Notice(t('notice.noConnections'));
    return null;
  }
  const manager = deps.manager();
  if (manager === null) new Notice(t('notice.engineNotReady'));
  return manager;
}
