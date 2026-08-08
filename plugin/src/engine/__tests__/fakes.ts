import type { BlobHash, DocId, SpaceId } from '@vaultwire/shared';
import type { IndexEntry, LocalDelta, LocalFile, RemoteChange } from '../types';

/** docId в тестах читаемый: реальный HMAC ничего не добавил бы к проверке решений. */
export function docIdFor(path: string): DocId {
  return `doc:${path}` as DocId;
}

export function entry(path: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    path,
    docId: docIdFor(path),
    rev: 1,
    plainHash: `hash:${path}`,
    mtime: 1000,
    size: 10,
    syncedAt: 1000,
    dirty: false,
    ...overrides,
  };
}

export function localFile(path: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return { path, mtime: 2000, ctime: 500, size: 20, ...overrides };
}

export function remoteChange(path: string, overrides: Partial<RemoteChange> = {}): RemoteChange {
  return {
    docId: docIdFor(path),
    rev: 2,
    seq: 2,
    deleted: false,
    path,
    plainHash: `remote:${path}`,
    mtime: 3000,
    ctime: 500,
    size: 30,
    blobHash: 'a'.repeat(64) as BlobHash,
    ...overrides,
  };
}

export function delta(overrides: Partial<LocalDelta> = {}): LocalDelta {
  return {
    created: [],
    modified: [],
    deleted: [],
    unchanged: [],
    skipped: [],
    scanned: 0,
    ...overrides,
  };
}

export const TEST_SPACE = 'space-1' as SpaceId;
