import type { DocId, Role, SpaceId } from '@vaultwire/shared';
import type { VaultwireClient } from '../../api/client';
import { computeDocId } from '../../crypto';
import type { KeyBundle } from '../../crypto';
import { decide } from '../../engine/decide';
import type { SyncOp } from '../../engine/ops';
import { scanConnection } from '../../engine/scanner';
import type { ScanFile } from '../../engine/scanner';
import type { SkippedFile } from '../../engine/types';
import { fetchChanges } from '../../sync/remote';

export interface PlanRequest {
  readonly client: VaultwireClient;
  readonly spaceId: SpaceId;
  readonly keys: KeyBundle;
  readonly role: Role;
  /** Папка подключения от корня хранилища; пустая строка — всё хранилище. */
  readonly folder: string;
  readonly files: readonly ScanFile[];
  readonly maxFileBytes: number;
}

export interface ConnectionPlan {
  readonly ops: readonly SyncOp[];
  readonly skipped: readonly SkippedFile[];
  /** Счётчик пространства на момент построения плана. */
  readonly seq: number;
}

/**
 * План первого подключения: индекс пуст, догон идёт с нуля, поэтому таблица
 * решений сводится без единой записи — ни на диск, ни на сервер. Раздел 6,
 * предпросмотр перед применением.
 */
export async function computeConnectionPlan(request: PlanRequest): Promise<ConnectionPlan> {
  const local = scanConnection(request.files, [], {
    folder: request.folder,
    include: [],
    exclude: [],
    maxFileBytes: request.maxFileBytes,
  });
  const remote = await fetchChanges(request.client, request.spaceId, 0, request.keys);

  // Индекс пуст, значит всё локальное — это created; docId нужен только им.
  const paths = local.created.map((file) => file.path);
  const docIds = await resolveDocIds(request.keys, paths);

  const ops = decide({
    index: [],
    local,
    remote: remote.changes,
    role: request.role,
    docIdFor: (path: string): DocId => {
      const docId = docIds.get(path);
      if (docId === undefined) throw new Error(`vaultwire: docId не посчитан: ${path}`);
      return docId;
    },
  });
  return { ops, skipped: local.skipped, seq: remote.seq };
}

async function resolveDocIds(
  keys: KeyBundle,
  paths: readonly string[],
): Promise<ReadonlyMap<string, DocId>> {
  const unique = [...new Set(paths)];
  const computed = await Promise.all(unique.map((path) => computeDocId(keys.pathKey, path)));
  const map = new Map<string, DocId>();
  unique.forEach((path, i) => {
    const docId = computed[i];
    if (docId !== undefined) map.set(path, docId);
  });
  return map;
}
