import type { RequestUrlParam } from 'obsidian';
import { BLOB_HASH_HEADER } from '@vaultwire/shared';
import {
  computeDocId,
  encryptBuffer,
  encryptMeta,
  sha256Hex,
  toArrayBuffer,
  utf8Encode,
} from '../../crypto';
import type { KeyBundle } from '../../crypto';
import type { Handler, Reply } from './harness';

export const PATH = 'Заметка.md';
export const VAULT_PATH = `Команда/${PATH}`;

/** Серверная версия документа: тело блобом, метаданные шифром. */
export async function remoteDoc(keys: KeyBundle, text: string, rev: number, seq: number) {
  const plain = toArrayBuffer(utf8Encode(text));
  const cipher = await encryptBuffer(keys.contentKey, plain);
  const item = {
    docId: await computeDocId(keys.pathKey, PATH),
    rev,
    seq,
    deleted: false,
    metaCipher: await encryptMeta(keys.metaKey, {
      path: PATH,
      mtime: 3000,
      ctime: 500,
      size: plain.byteLength,
      plainSha256: await sha256Hex(plain),
      deviceLabel: 'сервер',
      op: 'update',
    }),
    blobHash: await sha256Hex(cipher),
    size: plain.byteLength,
  };
  return { item, cipher, changes: JSON.stringify({ seq, items: [item] }) };
}

/** Ответы сервера на приём: список изменений и тело блоба. */
export function pullHandler(changes: string, cipher: ArrayBuffer): Handler {
  return (param: RequestUrlParam): Reply | null => {
    if (param.url.includes('/changes')) return { status: 200, body: changes };
    if (param.url.includes('/blobs/')) return { status: 200, body: '', binary: cipher };
    return null;
  };
}

/** Ответы сервера на отправку: приём блоба и запись документа батчем. */
export function pushHandler(): Handler {
  return (param: RequestUrlParam): Reply | null => {
    if (param.url.includes('/changes')) {
      return { status: 200, body: JSON.stringify({ seq: 0, items: [] }) };
    }
    if (param.url.endsWith('/blobs')) {
      const headers = param.headers ?? {};
      return {
        status: 201,
        body: JSON.stringify({ hash: headers[BLOB_HASH_HEADER] ?? '', size: 10 }),
      };
    }
    if (param.url.endsWith(':batch')) {
      const items = (JSON.parse(String(param.body)) as { items: Array<{ docId: string }> }).items;
      const body = items.map((item, i) => ({ docId: item.docId, rev: 1, seq: 3 + i }));
      return { status: 200, body: JSON.stringify(body) };
    }
    return null;
  };
}
