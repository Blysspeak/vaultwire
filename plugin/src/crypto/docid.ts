import type { DocId } from '@vaultwire/shared';
import { toBase64Url, utf8Encode } from './encoding';

/**
 * Адресация документов по разделу 2:
 *   docId = base64url(HMAC-SHA256(pathKey, NFC(путь от корня подключения)))
 * Детерминированная, поэтому два клиента адресуют один файл без координации.
 */

/**
 * Разделитель всегда «/», ведущего слэша нет, путь считается от корня подключения.
 * NFC обязателен: кириллица с iOS приходит в NFD и без нормализации даёт второй документ.
 */
export function normalizeRelPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .normalize('NFC');
}

export async function computeDocId(pathKey: CryptoKey, relPath: string): Promise<DocId> {
  const mac = await crypto.subtle.sign('HMAC', pathKey, utf8Encode(normalizeRelPath(relPath)));
  return toBase64Url(new Uint8Array(mac)) as DocId;
}
