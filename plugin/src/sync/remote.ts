import { PROTOCOL_LIMITS } from '@vaultwire/shared';
import type { ChangeItem, SpaceId } from '@vaultwire/shared';
import type { VaultwireClient } from '../api/client';
import { decryptMeta } from '../crypto';
import type { KeyBundle } from '../crypto';
import type { RemoteChange } from '../engine/types';

export interface RemoteChanges {
  readonly changes: readonly RemoteChange[];
  /** Счётчик пространства на момент ответа: он и становится новым курсором. */
  readonly seq: number;
}

/**
 * Догон GET /changes от lastSeq страницами. Метаданные расшифровываются здесь,
 * дальше по конвейеру идут уже открытые пути и хеши: таблица решений чистая.
 */
export async function fetchChanges(
  client: VaultwireClient,
  spaceId: SpaceId,
  since: number,
  keys: KeyBundle,
  limit: number = PROTOCOL_LIMITS.changesDefaultLimit,
): Promise<RemoteChanges> {
  const changes: RemoteChange[] = [];
  let cursor = since;
  let seq = since;
  for (;;) {
    const page = await client.getChanges(spaceId, { since: cursor, limit });
    seq = page.seq;
    for (const item of page.items) changes.push(await toChange(item, keys));
    const last = page.items.at(-1);
    // Страница неполная или дошли до конца — догон закончен.
    if (last === undefined || page.items.length < limit || last.seq >= page.seq) break;
    cursor = last.seq;
  }
  return { changes, seq };
}

/** У надгробия метаданных нет: путь возьмётся из индекса при сведении таблицы. */
async function toChange(item: ChangeItem, keys: KeyBundle): Promise<RemoteChange> {
  const base = {
    docId: item.docId,
    rev: item.rev,
    seq: item.seq,
    deleted: item.deleted,
    size: item.size,
    blobHash: item.blobHash,
  };
  if (item.metaCipher === null) {
    return { ...base, path: null, plainHash: null, mtime: null, ctime: null };
  }
  const meta = await decryptMeta(keys.metaKey, item.metaCipher);
  return {
    ...base,
    path: meta.path,
    plainHash: meta.plainSha256,
    mtime: meta.mtime,
    ctime: meta.ctime,
  };
}
