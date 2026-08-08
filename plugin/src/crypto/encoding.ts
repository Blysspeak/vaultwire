/**
 * Кодирование байтов и строк. Только браузерные примитивы: Node API в плагине запрещены.
 */

/**
 * Байты поверх обычного ArrayBuffer. WebCrypto не принимает виды над SharedArrayBuffer,
 * а голый Uint8Array в TypeScript означает именно «любой буфер», отсюда параметр.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Порция при переводе байтов в двоичную строку: спред на весь файл переполнит стек. */
const BINARY_CHUNK = 0x8000;

export function utf8Encode(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Bytes): string {
  return new TextDecoder().decode(bytes);
}

function toBinaryString(bytes: Bytes): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += BINARY_CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + BINARY_CHUNK));
  }
  return out;
}

/** Стандартный base64 с паддингом: в таком виде шифроблобы уходят в JSON протокола. */
export function toBase64(bytes: Bytes): string {
  return btoa(toBinaryString(bytes));
}

export function fromBase64(text: string): Bytes {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** base64url без паддинга: алфавит docId и хешей в путях. */
export function toBase64Url(bytes: Bytes): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Bytes {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (standard.length % 4)) % 4;
  return fromBase64(standard + '='.repeat(padding));
}

export function toHex(bytes: Bytes): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/** Вид на те же байты без копии, когда представление уже плотное. */
export function toArrayBuffer(bytes: Bytes): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
