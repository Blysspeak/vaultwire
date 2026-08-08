import { decryptString, encryptString } from './cipher';
import { fromBase64, toBase64 } from './encoding';

/**
 * Метаданные документа по разделу 2: сервер их не видит, они едут в metaCipher.
 * Путь лежит именно здесь, поэтому структура папок серверу неизвестна.
 */

export const DOC_OPS = ['create', 'update', 'delete', 'move'] as const;
export type DocOp = (typeof DOC_OPS)[number];

export interface DocMeta {
  /** Путь от корня подключения, нормализованный так же, как для docId. */
  readonly path: string;
  readonly mtime: number;
  readonly ctime: number;
  /** Размер открытого содержимого, байт. */
  readonly size: number;
  /** SHA-256 открытого содержимого, нижний регистр hex. */
  readonly plainSha256: string;
  /** Метка устройства-автора, показывается в истории и корзине. */
  readonly deviceLabel: string;
  readonly op: DocOp;
}

/** Порядок ключей фиксирован: одинаковая запись даёт одинаковый JSON. */
export function serializeMeta(meta: DocMeta): string {
  return JSON.stringify({
    path: meta.path,
    mtime: meta.mtime,
    ctime: meta.ctime,
    size: meta.size,
    plainSha256: meta.plainSha256,
    deviceLabel: meta.deviceLabel,
    op: meta.op,
  });
}

export function parseMeta(json: string): DocMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    throw new Error('vaultwire: метаданные документа не разбираются', { cause });
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vaultwire: метаданные документа не объект');
  }
  const value = raw as Record<string, unknown>;
  const path = value['path'];
  const mtime = value['mtime'];
  const ctime = value['ctime'];
  const size = value['size'];
  const plainSha256 = value['plainSha256'];
  const deviceLabel = value['deviceLabel'];
  const op = value['op'];
  if (
    typeof path !== 'string' ||
    typeof mtime !== 'number' ||
    typeof ctime !== 'number' ||
    typeof size !== 'number' ||
    typeof plainSha256 !== 'string' ||
    typeof deviceLabel !== 'string' ||
    !isDocOp(op)
  ) {
    throw new Error('vaultwire: метаданные документа неполные');
  }
  return { path, mtime, ctime, size, plainSha256, deviceLabel, op };
}

/** Готовый metaCipher в base64: в этом виде поле уходит в PUT /docs. */
export async function encryptMeta(metaKey: CryptoKey, meta: DocMeta): Promise<string> {
  return toBase64(await encryptString(metaKey, serializeMeta(meta)));
}

export async function decryptMeta(metaKey: CryptoKey, metaCipher: string): Promise<DocMeta> {
  return parseMeta(await decryptString(metaKey, fromBase64(metaCipher)));
}

function isDocOp(value: unknown): value is DocOp {
  return typeof value === 'string' && (DOC_OPS as readonly string[]).includes(value);
}
