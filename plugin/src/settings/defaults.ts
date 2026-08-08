import { Platform } from 'obsidian';
import type { ConnectionSettings, VaultwireSettings } from './types';

export const SETTINGS_SCHEMA_VERSION = 1;

/** Пределы по разделу 6: мобильные устройства заметно скупее на память. */
export const MAX_FILE_BYTES_DESKTOP = 50 * 1024 * 1024;
export const MAX_FILE_BYTES_MOBILE = 20 * 1024 * 1024;
export const CONCURRENCY_DESKTOP = 4;
export const CONCURRENCY_MOBILE = 2;

export const POLL_INTERVAL_MS = 30_000;
export const MASS_DELETE_ABSOLUTE = 20;
export const MASS_DELETE_RATIO = 0.15;
/** Попыток на документ до переноса в список проблемных. */
export const SYNC_MAX_ATTEMPTS = 5;

/** Границы значений, которые пользователь правит руками. */
export const SETTINGS_BOUNDS = {
  maxFileBytesMin: 1024 * 1024,
  maxFileBytesMax: 512 * 1024 * 1024,
  concurrencyMin: 1,
  concurrencyMax: 8,
  pollIntervalMsMin: 5_000,
  pollIntervalMsMax: 600_000,
} as const;

/**
 * Пути, которые не синхронизируются никогда, независимо от фильтров подключения.
 * `.trash` обязателен: иначе удалённые файлы возвращаются как новые (раздел 7).
 */
export const ALWAYS_EXCLUDED = ['.trash/**', '.obsidian/**'] as const;

export function defaultMaxFileBytes(): number {
  return Platform.isMobile ? MAX_FILE_BYTES_MOBILE : MAX_FILE_BYTES_DESKTOP;
}

export function defaultConcurrency(): number {
  return Platform.isMobile ? CONCURRENCY_MOBILE : CONCURRENCY_DESKTOP;
}

export function createDefaultSettings(): VaultwireSettings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    connections: [],
    maxFileBytes: defaultMaxFileBytes(),
    concurrency: defaultConcurrency(),
    pollIntervalMs: POLL_INTERVAL_MS,
    massDeleteAbsolute: MASS_DELETE_ABSOLUTE,
    massDeleteRatio: MASS_DELETE_RATIO,
    bootstrapToken: '',
    logLevel: 'info',
  };
}

/** Поля подключения, которые не приходят от сервера и мастера. */
type ConnectionIdentity = Pick<
  ConnectionSettings,
  'spaceId' | 'serverUrl' | 'deviceId' | 'deviceToken' | 'label' | 'localFolder' | 'role' | 'keyEpoch'
>;

export function createDefaultConnection(identity: ConnectionIdentity): ConnectionSettings {
  return {
    ...identity,
    include: [],
    exclude: [],
    maxFileBytes: null,
    // Автослияние по разделу 12 в первой версии выключено по умолчанию.
    conflictStrategy: 'copy',
    autoSync: true,
    lastSeq: 0,
    lastSyncedAt: null,
  };
}
