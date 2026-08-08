/** Публичный API оркестратора синхронизации. Разделы 4 и 6 спецификации. */

export { CONNECTION_STATES, STATE_SEVERITY, WINDOW_TIMERS, emptyReport } from './types';
export type { ConnectionState, RunReport, RunTrigger, SyncLimits, Timers, VaultReader } from './types';

export { TEXT_EXTENSIONS, isTextPath, relativePath, vaultPath } from './paths';

export { SyncConnection } from './connection';
export type { PendingChanges } from './connection';

export { fetchChanges } from './remote';
export type { RemoteChanges } from './remote';

export { decodeBody, fetchBody, moveDoc, pushDelete, pushDoc, readLocal } from './transfer';
export type { TransferContext } from './transfer';

export { preparePull } from './pull';
export type { PullOutcome } from './pull';
export { planConflict } from './pull-conflict';
export type { ConflictPlan, ConflictPolicy } from './pull-conflict';
export { runPush } from './push';
export type { PushOutcome } from './push';

export { runPass } from './pass';
export type { PassDeps } from './pass';
export { SyncRunner } from './runner';
export type { RunnerDeps } from './runner';

export { SyncWatcher, WATCH_DEBOUNCE_MS } from './watcher';
export type { WatcherDeps } from './watcher';

export { BOOTSTRAP_FAILURES, bootstrapConnection } from './bootstrap';
export type { BootstrapFailure, BootstrapResult } from './bootstrap';

export { LiveSync } from './live';
export type { LiveSyncDeps } from './live';

export { createRuntime } from './runtime';
export type { ConnectionRuntime, RuntimeDeps } from './runtime';
export { SyncManager } from './manager';

export { aggregateStatus, connectionStatus, worstState } from './status';
export type { ConnectionStatus, SyncStatus } from './status';

export { ObsidianVaultReader } from './vault-reader';
export { registerVaultEvents } from './vault-events';
