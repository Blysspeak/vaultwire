import type { App } from 'obsidian';
import type { RingLog } from '../log';
import type { SettingsActions } from '../settings/actions';
import type { VaultwireSettings } from '../settings/types';
import type { SyncManager } from '../sync';
import { openConnect } from './connect';
import type { ConflictRegistries } from './registries';

/** Всё, что вкладке настроек и командам нужно от плагина. */
export interface ActionsDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  readonly registries: ConflictRegistries;
  /** Движок поднимается на готовой раскладке, до неё его нет. */
  manager(): SyncManager | null;
  save(): Promise<void>;
  refresh(): void;
}

export function createSettingsActions(deps: ActionsDeps): SettingsActions {
  return {
    manager: () => deps.manager(),
  };
}

export function openConnectSpace(deps: ActionsDeps): void {
  const manager = deps.manager();
  if (manager === null) return;
  openConnect({
    app: deps.app,
    settings: deps.settings,
    log: deps.log,
    manager,
    registries: deps.registries,
    save: () => deps.save(),
    refresh: deps.refresh,
  });
}
