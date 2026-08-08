import type { ChangeItem, DeviceId, DocId, Rev } from '@vaultwire/shared';
import { lastLiveRevision, listRevisions, restoreRevision } from './revisions';
import type { HistoryDeps, RestoreResult, RestoreVault } from './types';

/**
 * Корзина из раздела 7. Удаление это надгробие: документ помечен удалённым,
 * тело живёт срок хранения, поэтому восстановление возможно без бэкапа.
 */

/** Страховка от бесконечного догона, если сервер отдаёт страницы без движения seq. */
const MAX_PAGES = 200;

export interface TrashItem {
  readonly docId: DocId;
  /** Путь из последней живой ревизии; null — метаданные не расшифровались. */
  readonly path: string | null;
  readonly size: number;
  readonly deletedAt: number;
  /** Устройство, поставившее надгробие. Метку по нему разрешает список участников. */
  readonly deletedBy: DeviceId;
  /** Ревизия, содержимое которой вернётся при восстановлении. */
  readonly restoreRev: Rev | null;
}

/** Удалённые документы пространства. Каждый требует своей истории: у надгробия нет метаданных. */
export async function listTrash(deps: HistoryDeps): Promise<TrashItem[]> {
  const latest = await collectLatest(deps);
  const items: TrashItem[] = [];
  for (const change of latest.values()) {
    if (!change.deleted) continue;
    const revisions = await listRevisions(deps, change.docId);
    const tombstone = revisions.find((item) => item.rev === change.rev);
    const live = lastLiveRevision(revisions);
    items.push({
      docId: change.docId,
      path: live?.path ?? null,
      size: live?.size ?? change.size,
      deletedAt: tombstone?.createdAt ?? 0,
      deletedBy: (tombstone?.deviceId ?? '') as DeviceId,
      restoreRev: live?.rev ?? null,
    });
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Восстановление кладёт содержимое последней живой ревизии обратно на диск.
 * Дальше файл воскресает обычным прогоном: локальная правка против надгробия
 * это строка «изменено локально, удалено на сервере» таблицы решений.
 */
export async function restoreFromTrash(
  deps: HistoryDeps,
  vault: RestoreVault,
  item: TrashItem,
  vaultPath: string,
  now: number,
): Promise<RestoreResult> {
  if (item.restoreRev === null) {
    return { outcome: 'missing', docId: item.docId, rev: 0, path: vaultPath };
  }
  return restoreRevision(deps, vault, {
    docId: item.docId,
    rev: item.restoreRev,
    vaultPath,
    now,
  });
}

/** Полный проход по changes: состояние каждого документа на текущий момент. */
async function collectLatest(deps: HistoryDeps): Promise<Map<DocId, ChangeItem>> {
  const latest = new Map<DocId, ChangeItem>();
  let since = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await deps.client.getChanges(deps.spaceId, { since });
    for (const item of response.items) latest.set(item.docId, item);
    const last = response.items.at(-1);
    if (last === undefined || last.seq <= since) break;
    since = last.seq;
    if (since >= response.seq) break;
  }
  return latest;
}
