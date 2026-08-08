import type { DocId } from '@vaultwire/shared';
import type { ConflictOp, SyncOp } from './ops';
import type { IndexEntry, LocalFile, RemoteChange, RenameHint } from './types';

/** Строки таблицы раздела 6 по одной. Все функции чистые. */

/** Сервер тронул документ, если прислал ревизию, отличную от записанной в индексе. */
function remoteChanged(entry: IndexEntry, remote: RemoteChange | undefined): remote is RemoteChange {
  return remote !== undefined && remote.rev !== entry.rev;
}

export function conflictOp(
  path: string,
  docId: DocId,
  reason: ConflictOp['reason'],
  local: LocalFile | null,
  remote: RemoteChange,
): ConflictOp {
  return { kind: 'conflict', path, docId, reason, local, remote };
}

function readOnly(path: string, docId: DocId): SyncOp {
  return { kind: 'noop', path, docId, reason: 'read-only' };
}

/** Создано локально: нет на сервере — отправить, создано на сервере — конфликт. */
export function decideCreated(
  file: LocalFile,
  docId: DocId,
  remote: RemoteChange | undefined,
  writable: boolean,
): SyncOp {
  if (remote !== undefined && !remote.deleted) {
    return conflictOp(file.path, docId, 'both-created', file, remote);
  }
  if (!writable) return readOnly(file.path, docId);
  const reason = remote === undefined ? 'local-created' : 'local-modified-remote-deleted';
  return { kind: 'push', path: file.path, docId, reason, local: file, expectedRev: remote?.rev ?? null };
}

/** Изменено локально: сервер молчит — отправить, изменил — конфликт, удалил — воскресить. */
export function decideModified(
  file: LocalFile,
  entry: IndexEntry,
  remote: RemoteChange | undefined,
  writable: boolean,
): SyncOp {
  if (remoteChanged(entry, remote)) {
    if (!remote.deleted) return conflictOp(file.path, entry.docId, 'both-modified', file, remote);
    // Роль ro воскресить не может: локальная версия уходит в конфликтную копию.
    return writable
      ? {
          kind: 'push',
          path: file.path,
          docId: entry.docId,
          reason: 'local-modified-remote-deleted',
          local: file,
          expectedRev: remote.rev,
        }
      : conflictOp(file.path, entry.docId, 'local-modified-remote-deleted', file, remote);
  }
  if (!writable) return readOnly(file.path, entry.docId);
  return {
    kind: 'push',
    path: file.path,
    docId: entry.docId,
    reason: 'local-modified',
    local: file,
    expectedRev: entry.rev,
  };
}

/** Удалено локально: сервер молчит — отправить удаление, изменил — файл воскресает. */
export function decideDeleted(
  entry: IndexEntry,
  remote: RemoteChange | undefined,
  writable: boolean,
): SyncOp {
  const path = entry.path;
  if (remoteChanged(entry, remote)) {
    return remote.deleted
      ? { kind: 'noop', path, docId: entry.docId, reason: 'both-deleted' }
      : { kind: 'pull', path, docId: entry.docId, reason: 'local-deleted-remote-modified', remote };
  }
  if (!writable) return readOnly(path, entry.docId);
  return { kind: 'pushDelete', path, docId: entry.docId, reason: 'local-deleted', expectedRev: entry.rev };
}

/** Локально без изменений: принимаем всё, что прислал сервер. */
export function decideUnchanged(
  path: string,
  entry: IndexEntry,
  remote: RemoteChange | undefined,
): SyncOp {
  if (!remoteChanged(entry, remote)) {
    return { kind: 'noop', path, docId: entry.docId, reason: 'both-unchanged' };
  }
  return remote.deleted
    ? { kind: 'pullDelete', path, docId: entry.docId, reason: 'remote-deleted', remote }
    : { kind: 'pull', path, docId: entry.docId, reason: 'remote-modified', remote };
}

/** Документ, которого нет ни в дельте скана, ни в разобранных путях. */
export function decideRemoteOnly(change: RemoteChange, entry: IndexEntry | undefined): SyncOp | null {
  const path = change.path ?? entry?.path ?? null;
  if (path === null) return null;
  if (change.deleted) {
    // Файла на диске нет, остаётся вычистить запись индекса.
    return { kind: 'noop', path, docId: change.docId, reason: 'remote-deleted' };
  }
  const reason = entry === undefined ? 'remote-created' : 'remote-modified';
  return { kind: 'pull', path, docId: change.docId, reason, remote: change };
}

/** Переезд одним запросом; если сервер тронул документ — переезд небезопасен. */
export function decideRename(
  hint: RenameHint,
  entry: IndexEntry,
  remote: RemoteChange | undefined,
  toDocId: DocId,
  writable: boolean,
): SyncOp {
  if (remoteChanged(entry, remote) && !remote.deleted) {
    return conflictOp(hint.fromPath, entry.docId, 'both-modified', hint.file, remote);
  }
  if (!writable) return readOnly(hint.toPath, toDocId);
  return {
    kind: 'move',
    path: hint.toPath,
    docId: toDocId,
    reason: 'renamed',
    fromPath: hint.fromPath,
    fromDocId: entry.docId,
    fromRev: entry.rev,
    local: hint.file,
  };
}
