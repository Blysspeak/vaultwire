import type { App } from 'obsidian';
import { obsidianRequest } from '../api/request';
import { ObsidianVaultGateway } from '../engine/vault-gateway';
import type { RingLog } from '../log';
import type { VaultwireSettings } from '../settings/types';
import { ObsidianVaultReader, SyncManager } from '../sync';
import type { SyncLimits } from '../sync';
import { createConflictGlue } from './conflict-glue';
import type { ConflictRegistries } from './registries';

export interface EngineDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  readonly registries: ConflictRegistries;
  /** plugin.registerInterval поверх window.setInterval: таймеры снимает Obsidian. */
  readonly registerInterval: (run: () => void, ms: number) => void;
}

/**
 * Реестр подключений со всей обвязкой. Обвязка конфликтов знает о реестре,
 * а реестр о ней — поэтому ссылка на менеджер отдаётся функцией, а не значением.
 */
export function createSyncManager(deps: EngineDeps): SyncManager {
  let manager: SyncManager | null = null;
  const glue = createConflictGlue({
    app: deps.app,
    manager: () => manager,
    registries: deps.registries,
    log: deps.log,
  });
  manager = new SyncManager({
    reader: new ObsidianVaultReader(deps.app),
    gateway: new ObsidianVaultGateway(deps.app),
    adapter: deps.app.vault.adapter,
    configDir: deps.app.vault.configDir,
    request: obsidianRequest,
    limits: () => limitsOf(deps),
    pollIntervalMs: () => deps.settings.pollIntervalMs,
    registerInterval: deps.registerInterval,
    log: deps.log,
    merge: glue.merge,
    onConflict: glue.onConflict,
  });
  return manager;
}

/** Метку устройства подставляет само подключение (sync/runtime); здесь запасная. */
function limitsOf(deps: EngineDeps): SyncLimits {
  return {
    maxFileBytes: deps.settings.maxFileBytes,
    concurrency: deps.settings.concurrency,
    massDeleteAbsolute: deps.settings.massDeleteAbsolute,
    massDeleteRatio: deps.settings.massDeleteRatio,
    deviceLabel: deps.app.vault.getName(),
  };
}
