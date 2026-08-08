import type { SpaceId } from '@vaultwire/shared';
import { decryptString, encryptString } from './cipher';
import { fromBase64, toBase64 } from './encoding';

/**
 * Верификатор пароля по разделу 2: AES-GCM(metaKey, "vaultwire-v1:" + spaceId).
 * Не сошёлся — синхронизация не стартует, иначе один человек с опечаткой
 * зальёт в пространство параллельный набор нечитаемых файлов.
 */

export const VERIFIER_PREFIX = 'vaultwire-v1:';

export function verifierPlaintext(spaceId: SpaceId): string {
  return `${VERIFIER_PREFIX}${spaceId}`;
}

/** Возвращает шифроблоб в base64, ровно в том виде, в каком он хранится на сервере. */
export async function createVerifier(metaKey: CryptoKey, spaceId: SpaceId): Promise<string> {
  return toBase64(await encryptString(metaKey, verifierPlaintext(spaceId)));
}

export async function checkVerifier(
  metaKey: CryptoKey,
  spaceId: SpaceId,
  verifier: string,
): Promise<boolean> {
  try {
    const text = await decryptString(metaKey, fromBase64(verifier));
    return text === verifierPlaintext(spaceId);
  } catch {
    // Неверный пароль, чужое пространство или мусор в поле — для вызывающего одно и то же.
    return false;
  }
}
