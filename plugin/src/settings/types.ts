import type { DeviceId, Role, SpaceId } from '@vaultwire/shared';
import type { LogLevel } from '../log';

/**
 * Стратегия разрешения конфликта по разделу 7.
 * copy — конфликтная копия рядом (по умолчанию),
 * merge — трёхстороннее построчное слияние markdown,
 * newest — побеждает свежий по времени изменения.
 */
export const CONFLICT_STRATEGIES = ['copy', 'merge', 'newest'] as const;
export type ConflictStrategy = (typeof CONFLICT_STRATEGIES)[number];

/** Локальная привязка пространства к папке хранилища. */
export interface ConnectionSettings {
  /** Пространство на сервере. Оно же ключ подключения внутри хранилища. */
  readonly spaceId: SpaceId;
  /** Базовый URL сервера, без завершающего слэша. */
  serverUrl: string;
  /** Устройство, выданное при активации инвайта. */
  readonly deviceId: DeviceId;
  /** Секрет. В экспорт диагностики не попадает никогда. */
  deviceToken: string;
  /** Имя подключения в интерфейсе. */
  label: string;
  /** Метка этого устройства: уходит в метаданные документа и в имя конфликтной копии. */
  deviceLabel: string;
  /** Папка внутри хранилища, пустая строка — корень. Разделитель всегда «/». */
  localFolder: string;
  /** Роль, выданная сервером. Обновляется при каждом GET /spaces/{id}. */
  role: Role;
  /** Эпоха ключа пространства, участвует в выводе ключей. */
  keyEpoch: number;
  /** Маски включения; пустой список — берётся всё, кроме исключений. */
  include: string[];
  /** Маски исключения сверх жёстко исключённых путей. */
  exclude: string[];
  /** Лимит размера файла для подключения; null — общий лимит плагина. */
  maxFileBytes: number | null;
  conflictStrategy: ConflictStrategy;
  /** Синхронизировать по событиям и опросу; выключено — только вручную. */
  autoSync: boolean;
  /** Последний применённый seq сервера, точка догона changes. */
  lastSeq: number;
  /** Время последней успешной синхронизации, мс эпохи; null — ни разу. */
  lastSyncedAt: number | null;
}

/** Настройки плагина целиком, содержимое data.json. */
export interface VaultwireSettings {
  /** Версия формата настроек, для будущих миграций. */
  schemaVersion: number;
  connections: ConnectionSettings[];
  /** Общий лимит размера файла, байты. */
  maxFileBytes: number;
  /** Конкурентность очередей приёма и отправки. */
  concurrency: number;
  /** Период запасного опроса changes, мс. */
  pollIntervalMs: number;
  /** Порог подтверждения массового удаления, штук. */
  massDeleteAbsolute: number;
  /** Порог подтверждения массового удаления, доля файлов подключения. */
  massDeleteRatio: number;
  /** Секрет сервера для создания пространств; пусто — создание скрыто. */
  bootstrapToken: string;
  logLevel: LogLevel;
}
