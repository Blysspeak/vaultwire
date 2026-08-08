import type { SpaceId } from '@vaultwire/shared';
import type { MassOperationCheck } from '../engine/guards';
import type { ProblemDoc } from '../engine/queue';
import type { ScanFile } from '../engine/scanner';
import type { SkippedFile } from '../engine/types';

/**
 * Состояния подключения из разделов 8 и 9 спецификации плюс пауза,
 * которую ставит реестр подключений.
 */
export const CONNECTION_STATES = [
  'idle',
  'syncing',
  'offline',
  'error',
  'readonly',
  'revoked',
  'paused',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/** Порядок тяжести: агрегированное состояние берёт первое совпавшее. */
export const STATE_SEVERITY: readonly ConnectionState[] = [
  'revoked',
  'error',
  'offline',
  'syncing',
  'paused',
  'readonly',
  'idle',
];

/**
 * Чтение хранилища. Запись идёт через VaultGateway движка, здесь только
 * перечисление файлов и чтение тел: разделение упрощает подделку в тестах.
 */
export interface VaultReader {
  list(): readonly ScanFile[];
  readBinary(path: string): Promise<ArrayBuffer>;
}

/** Таймеры вынесены наружу ради тестов; в плагине это window. */
export interface Timers {
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const WINDOW_TIMERS: Timers = {
  setTimeout: (run: () => void, ms: number): number => window.setTimeout(run, ms),
  clearTimeout: (handle: number): void => {
    window.clearTimeout(handle);
  },
};

/** Достаточная часть прогона для наблюдателя и живого канала. */
export interface RunTrigger {
  run(): Promise<RunReport>;
}

/** Пределы прогона. Функцией, а не значением: настройки правятся на ходу. */
export interface SyncLimits {
  readonly maxFileBytes: number;
  readonly concurrency: number;
  readonly massDeleteAbsolute: number;
  readonly massDeleteRatio: number;
  /** Метка устройства уходит в метаданные документа и в имя конфликтной копии. */
  readonly deviceLabel: string;
}

/** Итог одного прогона: то, что показывает панель и журнал. */
export interface RunReport {
  readonly spaceId: SpaceId;
  readonly at: number;
  readonly pulled: readonly string[];
  readonly pushed: readonly string[];
  readonly trashed: readonly string[];
  readonly conflicts: readonly string[];
  readonly problems: readonly ProblemDoc[];
  readonly skipped: readonly SkippedFile[];
  /** Не null — прогон остановлен порогом массовых операций (раздел 6). */
  readonly massCheck: MassOperationCheck | null;
  readonly lastSeq: number;
  /** Прогон не выполнялся: пауза, отозванный доступ или нет ключей. */
  readonly idle: boolean;
}

export function emptyReport(spaceId: SpaceId, at: number, lastSeq: number, idle: boolean): RunReport {
  return {
    spaceId,
    at,
    pulled: [],
    pushed: [],
    trashed: [],
    conflicts: [],
    problems: [],
    skipped: [],
    massCheck: null,
    lastSeq,
    idle,
  };
}
