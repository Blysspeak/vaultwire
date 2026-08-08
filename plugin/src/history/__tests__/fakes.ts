import type {
  BlobHash,
  ChangesQuery,
  ChangesResponse,
  DeviceId,
  DocId,
  ListRevisionsResponse,
  RevisionItem,
  SpaceId,
} from '@vaultwire/shared';
import { encryptBuffer, encryptMeta, sha256Hex, utf8Encode } from '../../crypto';
import type { DocMeta } from '../../crypto';
import type { HistoryApi, RestoreVault, SpaceKeys } from '../types';

export const SPACE_ID = 'space-1' as SpaceId;
export const DOC_ID = 'a'.repeat(43) as DocId;
export const DEVICE_ID = 'device-1' as DeviceId;

/** Ключи прямо из байтов: PBKDF2 на 650 тысяч итераций в тестах не нужен. */
export async function testKeys(): Promise<SpaceKeys> {
  const raw = new Uint8Array(32).fill(7);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { contentKey: key, metaKey: key };
}

export function blobHash(seed: string): BlobHash {
  return seed.repeat(64).slice(0, 64) as BlobHash;
}

export function meta(path: string, plainSha256: string, overrides: Partial<DocMeta> = {}): DocMeta {
  return {
    path,
    mtime: 1_000,
    ctime: 500,
    size: 10,
    plainSha256,
    deviceLabel: 'ноутбук',
    op: 'update',
    ...overrides,
  };
}

export interface FakeRevision {
  readonly rev: number;
  readonly text?: string;
  readonly path?: string;
  readonly deleted?: boolean;
  readonly createdAt?: number;
}

/** Клиент протокола на памяти: ревизии, тела и changes без сети. */
export class FakeHistoryApi implements HistoryApi {
  readonly blobs = new Map<string, ArrayBuffer>();
  revisions: RevisionItem[] = [];
  changes: ChangesResponse = { seq: 0, items: [] };
  revisionCalls = 0;

  constructor(private readonly keys: SpaceKeys) {}

  async seed(items: readonly FakeRevision[]): Promise<void> {
    const built: RevisionItem[] = [];
    for (const item of items) {
      const text = item.text ?? '';
      const body = utf8Encode(text);
      const hash = blobHash(String(item.rev));
      this.blobs.set(hash, await encryptBuffer(this.keys.contentKey, body.buffer));
      const deleted = item.deleted ?? false;
      built.push({
        rev: item.rev,
        seq: item.rev,
        deleted,
        metaCipher: deleted
          ? null
          : await encryptMeta(this.keys.metaKey, meta(item.path ?? 'Заметка.md', await sha256Hex(body))),
        blobHash: deleted ? null : hash,
        size: body.length,
        deviceId: DEVICE_ID,
        createdAt: item.createdAt ?? item.rev * 1_000,
      });
    }
    this.revisions = built.sort((a, b) => b.rev - a.rev);
  }

  listRevisions(_spaceId: SpaceId, _docId: DocId): Promise<ListRevisionsResponse> {
    this.revisionCalls += 1;
    return Promise.resolve(this.revisions);
  }

  downloadBlob(_spaceId: SpaceId, hash: BlobHash): Promise<ArrayBuffer> {
    const blob = this.blobs.get(hash);
    if (blob === undefined) return Promise.reject(new Error(`нет тела ${hash}`));
    return Promise.resolve(blob);
  }

  getChanges(_spaceId: SpaceId, _query?: Partial<ChangesQuery>): Promise<ChangesResponse> {
    return Promise.resolve(this.changes);
  }
}

/** Хранилище на памяти: считает записи, чтобы поймать лишнюю перезапись. */
export class FakeRestoreVault implements RestoreVault {
  readonly files = new Map<string, ArrayBuffer>();
  writes = 0;

  read(path: string): Promise<ArrayBuffer | null> {
    return Promise.resolve(this.files.get(path) ?? null);
  }

  write(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data);
    this.writes += 1;
    return Promise.resolve();
  }
}
