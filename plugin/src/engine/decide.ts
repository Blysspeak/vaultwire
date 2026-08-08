import type { DocId, Role } from '@vaultwire/shared';
import { canWrite } from '@vaultwire/shared';
import {
  decideCreated,
  decideDeleted,
  decideModified,
  decideRemoteOnly,
  decideRename,
  decideUnchanged,
} from './decide-rows';
import type { SyncOp } from './ops';
import type { IndexEntry, LocalDelta, RemoteChange, RenameHint } from './types';

/**
 * Вход таблицы решений раздела 6. Никакого ввода-вывода: docId считается заранее
 * (HMAC асинхронен), метаданные серверных изменений расшифрованы вызывающим.
 */
export interface DecideInput {
  readonly index: readonly IndexEntry[];
  readonly local: LocalDelta;
  readonly remote: readonly RemoteChange[];
  readonly renames?: readonly RenameHint[];
  readonly role: Role;
  readonly docIdFor: (path: string) => DocId;
}

/** Чистая функция: одинаковый вход всегда даёт одинаковый список операций. */
export function decide(input: DecideInput): SyncOp[] {
  const byPath = new Map(input.index.map((entry) => [entry.path, entry]));
  const byDoc = new Map(input.index.map((entry) => [entry.docId, entry]));
  const remoteByDoc = new Map(input.remote.map((change) => [change.docId, change]));
  const writable = canWrite(input.role);
  const ops: SyncOp[] = [];
  const seenDocs = new Set<DocId>();
  const seenPaths = new Set<string>();

  const take = (op: SyncOp): void => {
    seenDocs.add(op.docId);
    seenPaths.add(op.path);
    ops.push(op);
  };

  for (const hint of input.renames ?? []) {
    const entry = byPath.get(hint.fromPath);
    // Источник ни разу не синхронизировался: цель разберётся как обычное создание.
    if (entry === undefined) continue;
    const op = decideRename(hint, entry, remoteByDoc.get(entry.docId), input.docIdFor(hint.toPath), writable);
    seenDocs.add(entry.docId);
    seenPaths.add(hint.fromPath);
    take(op);
  }

  for (const file of input.local.created) {
    if (seenPaths.has(file.path)) continue;
    const docId = input.docIdFor(file.path);
    take(decideCreated(file, docId, remoteByDoc.get(docId), writable));
  }

  for (const file of input.local.modified) {
    const entry = byPath.get(file.path);
    if (entry === undefined || seenPaths.has(file.path)) continue;
    take(decideModified(file, entry, remoteByDoc.get(entry.docId), writable));
  }

  for (const path of input.local.deleted) {
    const entry = byPath.get(path);
    if (entry === undefined || seenPaths.has(path)) continue;
    take(decideDeleted(entry, remoteByDoc.get(entry.docId), writable));
  }

  for (const path of input.local.unchanged) {
    const entry = byPath.get(path);
    if (entry === undefined || seenPaths.has(path)) continue;
    take(decideUnchanged(path, entry, remoteByDoc.get(entry.docId)));
  }

  for (const change of input.remote) {
    if (seenDocs.has(change.docId)) continue;
    const op = decideRemoteOnly(change, byDoc.get(change.docId));
    if (op !== null) take(op);
  }

  return ops;
}
