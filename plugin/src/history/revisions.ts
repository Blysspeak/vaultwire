import type { BlobHash, DocId, Rev } from '@vaultwire/shared';
import { decryptBuffer, decryptMeta, sha256Hex, utf8Decode } from '../crypto';
import type { HistoryDeps, RestoreResult, RestoreVault, RevisionInfo } from './types';

/**
 * История версий из раздела 7. Список ревизий сервер отдаёт зашифрованным,
 * расшифровка метаданных идёт здесь: без неё не видно ни пути, ни устройства.
 */
export async function listRevisions(deps: HistoryDeps, docId: DocId): Promise<RevisionInfo[]> {
  const items = await deps.client.listRevisions(deps.spaceId, docId);
  const infos: RevisionInfo[] = [];
  for (const item of items) {
    const meta = item.metaCipher === null ? null : await decryptMeta(deps.keys.metaKey, item.metaCipher);
    infos.push({
      rev: item.rev,
      seq: item.seq,
      deleted: item.deleted,
      createdAt: item.createdAt,
      deviceId: item.deviceId,
      size: item.size,
      blobHash: item.blobHash,
      path: meta?.path ?? null,
      deviceLabel: meta?.deviceLabel ?? null,
      mtime: meta?.mtime ?? null,
      ctime: meta?.ctime ?? null,
      plainSha256: meta?.plainSha256 ?? null,
    });
  }
  return infos;
}

/** Тело ревизии в открытом виде. Шифротело адресуется хешем, ревизия только ссылается. */
export async function loadRevisionBody(deps: HistoryDeps, hash: BlobHash): Promise<ArrayBuffer> {
  const blob = await deps.client.downloadBlob(deps.spaceId, hash);
  return decryptBuffer(deps.keys.contentKey, blob);
}

/** Базовый текст для трёхстороннего слияния и предпросмотра ревизии. */
export async function loadRevisionText(deps: HistoryDeps, hash: BlobHash): Promise<string> {
  return utf8Decode(new Uint8Array(await loadRevisionBody(deps, hash)));
}

/** Последняя ревизия с телом: точка восстановления удалённого документа. */
export function lastLiveRevision(revisions: readonly RevisionInfo[]): RevisionInfo | null {
  const live = revisions.filter((item) => !item.deleted && item.blobHash !== null);
  return live.reduce<RevisionInfo | null>(
    (best, item) => (best === null || item.rev > best.rev ? item : best),
    null,
  );
}

export interface RestoreRequest {
  readonly docId: DocId;
  readonly rev: Rev;
  /** Путь от корня хранилища, куда лечь содержимому ревизии. */
  readonly vaultPath: string;
  /** Момент восстановления: ревизия ложится как обычная свежая правка. */
  readonly now: number;
}

/**
 * Восстановление создаёт новую запись, история не переписывается: файл просто
 * получает старое содержимое, а обычный прогон отправит его новой ревизией.
 * Повторный вызов на том же содержимом ничего не пишет — операция идемпотентна.
 */
export async function restoreRevision(
  deps: HistoryDeps,
  vault: RestoreVault,
  request: RestoreRequest,
): Promise<RestoreResult> {
  const base = { docId: request.docId, rev: request.rev, path: request.vaultPath };
  const revisions = await listRevisions(deps, request.docId);
  const target = revisions.find((item) => item.rev === request.rev);
  if (target === undefined || target.blobHash === null) return { ...base, outcome: 'missing' };

  const current = await vault.read(request.vaultPath);
  const currentHash = current === null ? null : await sha256Hex(current);
  if (currentHash !== null && currentHash === target.plainSha256) {
    return { ...base, outcome: 'unchanged' };
  }

  const body = await loadRevisionBody(deps, target.blobHash);
  // Метаданных могло не быть: сверяем по фактическому телу, иначе повтор перезапишет файл.
  if (currentHash !== null && currentHash === (await sha256Hex(body))) {
    return { ...base, outcome: 'unchanged' };
  }
  await vault.write(request.vaultPath, body, request.now, target.ctime ?? request.now);
  return { ...base, outcome: 'restored' };
}
