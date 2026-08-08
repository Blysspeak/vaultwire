import { createClient } from '../api/client';
import type { RequestFn } from '../api/http';
import type { VaultGateway } from '../engine/apply';
import { ConnectionIndex } from '../engine/state';
import type { StateAdapter } from '../engine/state-file';
import type { RingLog } from '../log';
import type { ConnectionSettings } from '../settings/types';
import { SyncConnection } from './connection';
import { LiveSync } from './live';
import { SyncRunner } from './runner';
import type { RunnerDeps } from './runner';
import type { SyncLimits, Timers, VaultReader } from './types';
import { SyncWatcher } from './watcher';

/** Общая на все подключения обвязка: хранилище, транспорт, таймеры, журнал. */
export interface RuntimeDeps {
  readonly reader: VaultReader;
  readonly gateway: VaultGateway;
  /** vault.adapter: файл индекса лежит вне дерева заметок. */
  readonly adapter: StateAdapter;
  readonly configDir: string;
  readonly request: RequestFn;
  readonly limits: () => SyncLimits;
  readonly pollIntervalMs: () => number;
  /** window.setInterval, обёрнутый в plugin.registerInterval. */
  readonly registerInterval: (run: () => void, ms: number) => void;
  readonly log: RingLog;
  readonly timers?: Timers;
  readonly createSocket?: (url: string) => WebSocket;
  /** Автослияние markdown и запись конфликта в реестр панели. */
  readonly merge?: RunnerDeps['merge'];
  readonly onConflict?: RunnerDeps['onConflict'];
  /** Итог прогона наружу: подсветка прилетевших изменений в проводнике. */
  readonly onReport?: RunnerDeps['onReport'];
}

/** Подключение со всей обвязкой: прогон, наблюдатель, живой канал. */
export interface ConnectionRuntime {
  readonly connection: SyncConnection;
  readonly runner: SyncRunner;
  readonly watcher: SyncWatcher;
  readonly live: LiveSync;
}

export function createRuntime(settings: ConnectionSettings, deps: RuntimeDeps): ConnectionRuntime {
  const client = createClient({
    baseUrl: settings.serverUrl,
    token: settings.deviceToken,
    request: deps.request,
  });
  const index = new ConnectionIndex(deps.adapter, {
    configDir: deps.configDir,
    spaceId: settings.spaceId,
  });
  const connection = new SyncConnection(settings, client, index);
  // Пределы общие, а метка своя у каждого подключения: она уходит в метаданные
  // документа и в имя конфликтной копии.
  const limits = (): SyncLimits => ({ ...deps.limits(), deviceLabel: settings.deviceLabel });
  const runner = new SyncRunner({
    connection,
    reader: deps.reader,
    gateway: deps.gateway,
    limits,
    log: deps.log,
    ...(deps.merge === undefined ? {} : { merge: deps.merge }),
    ...(deps.onConflict === undefined ? {} : { onConflict: deps.onConflict }),
    ...(deps.onReport === undefined ? {} : { onReport: deps.onReport }),
  });
  const watcher = new SyncWatcher({
    connection,
    runner,
    ...(deps.timers === undefined ? {} : { timers: deps.timers }),
  });
  const live = new LiveSync({
    connection,
    runner,
    pollIntervalMs: deps.pollIntervalMs(),
    registerInterval: deps.registerInterval,
    log: deps.log,
    ...(deps.createSocket === undefined ? {} : { createSocket: deps.createSocket }),
  });
  return { connection, runner, watcher, live };
}
