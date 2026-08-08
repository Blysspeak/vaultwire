import type { Bytes } from './encoding';
import { toBase64Url, toHex } from './encoding';

/**
 * SHA-256 содержимого. Открытый хеш идёт в метаданные и в локальный индекс
 * как опорная точка сравнения, хеш шифротела адресует блоб на сервере.
 */

export async function sha256(data: Bytes | ArrayBuffer): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** Нижний регистр hex: в этом виде хеш тела уходит в X-Blob-Sha256 и в blobHash. */
export async function sha256Hex(data: Bytes | ArrayBuffer): Promise<string> {
  return toHex(await sha256(data));
}

export async function sha256Base64Url(data: Bytes | ArrayBuffer): Promise<string> {
  return toBase64Url(await sha256(data));
}
