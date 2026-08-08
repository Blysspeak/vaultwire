import { describe, expect, it } from 'vitest';
import { sha256, sha256Base64Url, sha256Hex } from './hash';
import { fromBase64Url, toHex, utf8Encode } from './encoding';

/** Контрольные векторы SHA-256 из FIPS 180-4. */
const ABC_HEX = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const EMPTY_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('sha256', () => {
  it('совпадает с контрольными векторами', async () => {
    expect(await sha256Hex(utf8Encode('abc'))).toBe(ABC_HEX);
    expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_HEX);
  });

  it('даёт 32 байта и принимает ArrayBuffer', async () => {
    const bytes = utf8Encode('abc');
    expect((await sha256(bytes)).length).toBe(32);
    expect(await sha256Hex(bytes.buffer as ArrayBuffer)).toBe(ABC_HEX);
  });

  it('base64url обратим и совпадает с hex-вектором', async () => {
    const encoded = await sha256Base64Url(utf8Encode('abc'));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(toHex(fromBase64Url(encoded))).toBe(ABC_HEX);
  });
});
