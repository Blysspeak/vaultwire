import type {
  BlobHash,
  ChangesQuery,
  ChangesResponse,
  DeviceId,
  DocId,
  ListRevisionsResponse,
  Rev,
  Seq,
  SpaceId,
} from '@vaultwire/shared';

/** Ключи пространства, выведенные из пароля. Сервер их не видит никогда. */
export interface SpaceKeys {
  readonly contentKey: CryptoKey;
  readonly metaKey: CryptoKey;
}

/** Часть клиента протокола, нужная истории и корзине. VaultwireClient ей соответствует. */
export interface HistoryApi {
  listRevisions(spaceId: SpaceId, docId: DocId): Promise<ListRevisionsResponse>;
  downloadBlob(spaceId: SpaceId, hash: BlobHash): Promise<ArrayBuffer>;
  getChanges(spaceId: SpaceId, query?: Partial<ChangesQuery>): Promise<ChangesResponse>;
}

/** Всё, что нужно истории и корзине: клиент протокола, пространство и ключи. */
export interface HistoryDeps {
  readonly client: HistoryApi;
  readonly spaceId: SpaceId;
  readonly keys: SpaceKeys;
}

/**
 * Ревизия документа с расшифрованными метаданными. У надгробия метаданных нет:
 * DELETE идёт без тела, поэтому путь и метка устройства берутся из живой ревизии.
 */
export interface RevisionInfo {
  readonly rev: Rev;
  readonly seq: Seq;
  readonly deleted: boolean;
  readonly createdAt: number;
  readonly deviceId: DeviceId;
  readonly size: number;
  readonly blobHash: BlobHash | null;
  readonly path: string | null;
  readonly deviceLabel: string | null;
  readonly mtime: number | null;
  readonly ctime: number | null;
  readonly plainSha256: string | null;
}

/**
 * restored — файл записан, unchanged — на диске уже нужное содержимое,
 * missing — у ревизии нет тела и восстанавливать нечего.
 */
export const RESTORE_OUTCOMES = ['restored', 'unchanged', 'missing'] as const;
export type RestoreOutcome = (typeof RESTORE_OUTCOMES)[number];

export interface RestoreResult {
  readonly outcome: RestoreOutcome;
  readonly docId: DocId;
  readonly rev: Rev;
  readonly path: string;
}

/** Достаточная часть хранилища для восстановления: прочитать текущее и записать новое. */
export interface RestoreVault {
  read(path: string): Promise<ArrayBuffer | null>;
  write(path: string, data: ArrayBuffer, mtime: number, ctime: number): Promise<void>;
}
