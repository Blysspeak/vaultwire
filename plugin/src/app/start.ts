import type { App, EventRef } from 'obsidian';
import type { RingLog } from '../log';
import type { VaultwireSettings } from '../settings/types';
import { registerVaultEvents, SyncManager } from '../sync';
import type { StatusStore } from '../ui/panel/store';
import { createSyncManager } from './engine';
import type { ConflictRegistries } from './registries';
import { lockedConnections, unlockChain } from './unlock';

export interface StartDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  readonly registries: ConflictRegistries;
  readonly store: StatusStore;
  /** plugin.registerInterval и plugin.registerEvent: снятие — дело Obsidian. */
  registerInterval(run: () => void, ms: number): void;
  registerEvent(ref: EventRef): void;
}

/**
 * Подъём движка на готовой раскладке: реестр подключений, подписки на хранилище,
 * чтение реестров конфликтов и запрос паролей. Раздел 6 спецификации.
 */
export function startEngine(deps: StartDeps): SyncManager {
  const manager = createSyncManager({
    app: deps.app,
    settings: deps.settings,
    log: deps.log,
    registries: deps.registries,
    registerInterval: deps.registerInterval,
  });
  for (const connection of deps.settings.connections) manager.add(connection);
  registerVaultEvents(deps.app, manager, deps.registerEvent);

  const spaceIds = deps.settings.connections.map((connection) => connection.spaceId);
  void deps.registries.load(spaceIds).then(() => {
    deps.store.publish();
    askPasswords(deps, manager);
  });
  return manager;
}

/**
 * Пароль шифрования на диск не попадает никогда, поэтому после запуска ключей
 * нет и прогон невозможен. Спрашиваем только там, где включена автосинхронизация:
 * ручное подключение разблокируется своей командой.
 */
function askPasswords(deps: StartDeps, manager: SyncManager): void {
  const auto = deps.settings.connections.filter((connection) => connection.autoSync);
  unlockChain(deps.app, manager, lockedConnections(manager, auto), () => {
    deps.store.publish();
  });
}
