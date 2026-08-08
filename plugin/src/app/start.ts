import type { App, EventRef } from 'obsidian';
import type { RingLog } from '../log';
import type { VaultwireSettings } from '../settings/types';
import { registerVaultEvents, SyncManager } from '../sync';
import type { StatusStore } from '../ui/panel/store';
import { autoStart } from './auto-start';
import { createSyncManager } from './engine';
import type { ConflictRegistries } from './registries';
import { unlockChain } from './unlock-chain';

export interface StartDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  readonly registries: ConflictRegistries;
  readonly store: StatusStore;
  /** plugin.registerInterval и plugin.registerEvent: снятие — дело Obsidian. */
  registerInterval(run: () => void, ms: number): void;
  registerEvent(ref: EventRef): void;
  /** Запись настроек: сохранённый пароль мог не подойти и быть стёрт. */
  save(): Promise<void>;
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
 * Подключения с сохранённым паролем поднимаются сами. Окно открывается только
 * там, где пароля нет, и только при включённой автосинхронизации: ручное
 * подключение разблокируется своей командой.
 */
function askPasswords(deps: StartDeps, manager: SyncManager): void {
  const auto = deps.settings.connections.filter((connection) => connection.autoSync);
  void autoStart(manager, auto, () => deps.save()).then((queue) => {
    deps.store.publish();
    unlockChain(
      {
        app: deps.app,
        manager,
        save: () => deps.save(),
        onDone: () => {
          deps.store.publish();
        },
      },
      queue,
    );
  });
}
