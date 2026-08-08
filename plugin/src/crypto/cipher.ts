import type { Bytes } from './encoding';
import { toArrayBuffer, utf8Decode, utf8Encode } from './encoding';

/**
 * AES-256-GCM по разделу 2. У каждого блоба свой случайный IV,
 * он идёт префиксом к шифротексту, поэтому блоб самодостаточен.
 */

/** Длина IV, байт. Совпадает с PROTOCOL_LIMITS.ivBytes из shared. */
export const IV_BYTES = 12;

export async function encryptBytes(key: CryptoKey, plain: Bytes): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const blob = new Uint8Array(IV_BYTES + cipher.length);
  blob.set(iv, 0);
  blob.set(cipher, IV_BYTES);
  return blob;
}

export async function decryptBytes(key: CryptoKey, blob: Bytes): Promise<Bytes> {
  if (blob.length <= IV_BYTES) {
    throw new Error('vaultwire: шифроблоб короче IV');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const body = blob.subarray(IV_BYTES);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body));
  } catch (cause) {
    // Неверный ключ и повреждённый шифротекст неотличимы: GCM даёт одну и ту же ошибку.
    throw new Error('vaultwire: расшифровка не удалась', { cause });
  }
}

/** Тела файлов приходят из хранилища Obsidian как ArrayBuffer. */
export async function encryptBuffer(key: CryptoKey, plain: ArrayBuffer): Promise<ArrayBuffer> {
  return toArrayBuffer(await encryptBytes(key, new Uint8Array(plain)));
}

export async function decryptBuffer(key: CryptoKey, blob: ArrayBuffer): Promise<ArrayBuffer> {
  return toArrayBuffer(await decryptBytes(key, new Uint8Array(blob)));
}

export async function encryptString(key: CryptoKey, text: string): Promise<Bytes> {
  return encryptBytes(key, utf8Encode(text));
}

export async function decryptString(key: CryptoKey, blob: Bytes): Promise<string> {
  return utf8Decode(await decryptBytes(key, blob));
}
