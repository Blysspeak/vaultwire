import type { BlobHash, DocId, Rev, Seq } from '@vaultwire/shared';

/** Запись индекса подключения из раздела 6. Опорная точка сравнения — plainHash. */
export interface IndexEntry {
  /** Путь от корня подключения, нормализованный так же, как для docId. */
  readonly path: string;
  readonly docId: DocId;
  /** Ревизия сервера на момент последней успешной синхронизации. */
  readonly rev: Rev;
  /** SHA-256 открытого содержимого, нижний регистр hex. */
  readonly plainHash: string;
  readonly mtime: number;
  readonly size: number;
  readonly syncedAt: number;
  /** Изменение замечено, но ещё не отправлено: копится в офлайне. */
  readonly dirty: boolean;
}

/** Состояние файла на диске на момент скана. Содержимое не читается. */
export interface LocalFile {
  readonly path: string;
  readonly mtime: number;
  readonly ctime: number;
  readonly size: number;
}

/** Причина, по которой файл не попал в синхронизацию. */
export const SKIP_REASONS = ['excluded', 'too-large'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface SkippedFile {
  readonly path: string;
  readonly size: number;
  readonly reason: SkipReason;
}

/** Локальная дельта относительно индекса, результат сверочного скана. */
export interface LocalDelta {
  readonly created: readonly LocalFile[];
  readonly modified: readonly LocalFile[];
  /** Пути из индекса, которых больше нет на диске. */
  readonly deleted: readonly string[];
  readonly unchanged: readonly string[];
  readonly skipped: readonly SkippedFile[];
  /** Сколько файлов подключения увидел скан, знаменатель порога массовых операций. */
  readonly scanned: number;
}

/** Серверное изменение с уже расшифрованными метаданными. */
export interface RemoteChange {
  readonly docId: DocId;
  readonly rev: Rev;
  readonly seq: Seq;
  readonly deleted: boolean;
  /** Из metaCipher; у надгробия без метаданных путь берётся из индекса. */
  readonly path: string | null;
  readonly plainHash: string | null;
  readonly mtime: number | null;
  readonly ctime: number | null;
  readonly size: number;
  readonly blobHash: BlobHash | null;
}

/** Замеченное локальное переименование, приходит из события vault.on('rename'). */
export interface RenameHint {
  readonly fromPath: string;
  readonly toPath: string;
  readonly file: LocalFile;
}
