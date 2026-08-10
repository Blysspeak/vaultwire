import type { BlobHash, DocId, SpaceId } from '@vaultwire/shared';
import type { VaultwireClient } from '../api/client';
import { decryptBuffer, encryptBuffer, encryptMeta, sha256Hex, utf8Decode } from '../crypto';
import type { DocMeta, DocOp, KeyBundle } from '../crypto';
import type { EchoGuard } from '../engine/echo';
import type { MoveOp, PushDeleteOp, PushOp } from '../engine/ops';
import type { ConnectionIndex } from '../engine/state';
import type { LocalFile, RemoteChange } from '../engine/types';
import { isTextPath, vaultPath } from './paths';
import type { VaultReader } from './types';

/** Всё, что нужно обмену одним документом. Собирается прогоном на каждый проход. */
export interface TransferContext {
  readonly spaceId: SpaceId;
  readonly client: VaultwireClient;
  readonly keys: KeyBundle;
  readonly reader: VaultReader;
  readonly index: ConnectionIndex;
  readonly echo: EchoGuard;
  readonly folder: string;
  readonly deviceLabel: string;
  readonly now: () => number;
}

/**
 * Тело документа, готового к записи: блоб уже залит, метаданные уже зашифрованы.
 * Дальше это либо один PUT, либо элемент батча — разница только в транспорте.
 */
export interface PreparedPush {
  readonly path: string;
  readonly docId: DocId;
  readonly expectedRev: number | null;
  readonly metaCipher: string;
  readonly upload: Upload;
  readonly local: LocalFile;
}

/**
 * Заливка тела и подготовка записи, без самого запроса на запись: вызывающий
 * решает, идёт ли она одним PUT или элементом батча. null — второй барьер
 * подавления эха: содержимое совпало с индексом, значит это наша собственная
 * запись и отправлять нечего.
 */
export async function preparePush(ctx: TransferContext, op: PushOp): Promise<PreparedPush | null> {
  const plain = await readLocal(ctx, op.path);
  const plainHash = await sha256Hex(plain);
  const entry = ctx.index.get(op.path);
  if (entry !== undefined && !ctx.echo.shouldPush(op.path, plainHash, entry)) {
    ctx.index.set({ ...entry, mtime: op.local.mtime, size: plain.byteLength, dirty: false });
    return null;
  }
  const upload = await uploadBody(ctx, plain, plainHash);
  const kind: DocOp = op.expectedRev === null ? 'create' : 'update';
  const metaCipher = await encryptMeta(ctx.keys.metaKey, meta(ctx, op.path, op.local, upload, kind));
  return { path: op.path, docId: op.docId, expectedRev: op.expectedRev, metaCipher, upload, local: op.local };
}

/** Удаление это надгробие: тело живёт срок хранения, запись индекса уходит. */
export async function pushDelete(ctx: TransferContext, op: PushDeleteOp): Promise<void> {
  await ctx.client.deleteDoc(ctx.spaceId, op.docId, op.expectedRev);
  ctx.index.delete(op.path);
}

/** Переезд одним запросом: пара удаления и создания дала бы окно потери файла. */
export async function moveDoc(ctx: TransferContext, op: MoveOp): Promise<void> {
  const plain = await readLocal(ctx, op.path);
  const upload = await uploadBody(ctx, plain, await sha256Hex(plain));
  const metaCipher = await encryptMeta(ctx.keys.metaKey, meta(ctx, op.path, op.local, upload, 'move'));
  const result = await ctx.client.moveDoc(ctx.spaceId, {
    fromDocId: op.fromDocId,
    fromRev: op.fromRev,
    toDocId: op.docId,
    metaCipher,
    blobHash: upload.blobHash,
  });
  ctx.index.delete(op.fromPath);
  commitPush(ctx, op.path, op.docId, result.rev, upload, op.local.mtime);
}

/** Приём: тело блоба расшифровывается, запись на диск делает applyPlan. */
export async function fetchBody(ctx: TransferContext, remote: RemoteChange): Promise<ArrayBuffer> {
  if (remote.blobHash === null) throw new Error('vaultwire: у документа нет тела');
  const blob = await ctx.client.downloadBlob(ctx.spaceId, remote.blobHash);
  return decryptBuffer(ctx.keys.contentKey, blob);
}

export function readLocal(ctx: TransferContext, relPath: string): Promise<ArrayBuffer> {
  return ctx.reader.readBinary(vaultPath(ctx.folder, relPath));
}

/** Текст пишется строкой: у открытого редактора так корректно обновляется содержимое. */
export function decodeBody(relPath: string, body: ArrayBuffer): string | ArrayBuffer {
  return isTextPath(relPath) ? utf8Decode(new Uint8Array(body)) : body;
}

export interface Upload {
  readonly blobHash: BlobHash;
  readonly plainHash: string;
  readonly size: number;
}

async function uploadBody(ctx: TransferContext, plain: ArrayBuffer, plainHash: string): Promise<Upload> {
  const cipher = await encryptBuffer(ctx.keys.contentKey, plain);
  const blobHash = (await sha256Hex(cipher)) as BlobHash;
  await ctx.client.uploadBlob(ctx.spaceId, blobHash, cipher);
  return { blobHash, plainHash, size: plain.byteLength };
}

function meta(
  ctx: TransferContext,
  relPath: string,
  local: LocalFile,
  upload: Upload,
  op: DocOp,
): DocMeta {
  return {
    path: relPath,
    mtime: local.mtime,
    ctime: local.ctime,
    size: upload.size,
    plainSha256: upload.plainHash,
    deviceLabel: ctx.deviceLabel,
    op,
  };
}

/** Запись индекса после успешной отправки, общая для одиночного PUT и батча. */
export function commitPush(
  ctx: TransferContext,
  relPath: string,
  docId: DocId,
  rev: number,
  upload: Upload,
  mtime: number,
): void {
  ctx.index.set({
    path: relPath,
    docId,
    rev,
    plainHash: upload.plainHash,
    mtime,
    size: upload.size,
    syncedAt: ctx.now(),
    dirty: false,
    lastAuthor: ctx.deviceLabel,
    lastDirection: 'push',
  });
}
