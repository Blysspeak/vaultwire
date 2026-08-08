import type { Bytes } from './encoding';
import { utf8Encode } from './encoding';

/**
 * Вывод ключей по разделу 2 спецификации:
 *   master     = PBKDF2-SHA256(password, salt, 650000, 32 байта)
 *   contentKey = HKDF-SHA256(master, "vw:content:v1:<epoch>")  AES-256-GCM
 *   metaKey    = HKDF-SHA256(master, "vw:meta:v1:<epoch>")     AES-256-GCM
 *   pathKey    = HKDF-SHA256(master, "vw:path:v1:<epoch>")     HMAC-SHA256
 */

/** Итераций PBKDF2-SHA256. Совпадает с PROTOCOL_LIMITS.pbkdf2Iterations из shared. */
export const PBKDF2_ITERATIONS = 650_000;
/** Длина master-ключа, байт. */
export const MASTER_BYTES = 32;
/** Соль пространства, байт. */
export const SALT_BYTES = 32;

/** Соли у HKDF нет: случайная соль уже вошла в master через PBKDF2. */
const HKDF_SALT = new Uint8Array(0);

export function contentKeyInfo(epoch: number): string {
  return `vw:content:v1:${epoch}`;
}

export function metaKeyInfo(epoch: number): string {
  return `vw:meta:v1:${epoch}`;
}

export function pathKeyInfo(epoch: number): string {
  return `vw:path:v1:${epoch}`;
}

/** Тройка ключей одной эпохи. Ключи непроизводные: экспортировать их наружу нельзя. */
export interface KeyBundle {
  readonly epoch: number;
  /** AES-256-GCM, тела файлов. */
  readonly contentKey: CryptoKey;
  /** AES-256-GCM, метаданные и верификатор пароля. */
  readonly metaKey: CryptoKey;
  /** HMAC-SHA256, адресация документов. */
  readonly pathKey: CryptoKey;
}

/** Случайная соль пространства, генерируется один раз при создании. */
export function generateSalt(): Bytes {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function deriveMaster(password: string, salt: Bytes): Promise<Bytes> {
  const material = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    MASTER_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveKeys(master: Bytes, epoch: number): Promise<KeyBundle> {
  const material = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  const [contentKey, metaKey, pathKey] = await Promise.all([
    deriveAesKey(material, contentKeyInfo(epoch)),
    deriveAesKey(material, metaKeyInfo(epoch)),
    deriveHmacKey(material, pathKeyInfo(epoch)),
  ]);
  return { epoch, contentKey, metaKey, pathKey };
}

/** Пароль плюс соль плюс эпоха — всё, что нужно подключению для старта. */
export async function deriveBundle(
  password: string,
  salt: Bytes,
  epoch: number,
): Promise<KeyBundle> {
  return deriveKeys(await deriveMaster(password, salt), epoch);
}

function hkdfParams(info: string): HkdfParams {
  return { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: utf8Encode(info) };
}

function deriveAesKey(material: CryptoKey, info: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(hkdfParams(info), material, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function deriveHmacKey(material: CryptoKey, info: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    hkdfParams(info),
    material,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}
