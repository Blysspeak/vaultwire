import { describe, expect, it } from 'vitest';
import {
  IV_BYTES,
  decryptBuffer,
  decryptBytes,
  decryptString,
  encryptBuffer,
  encryptBytes,
  encryptString,
} from './cipher';
import { toHex } from './encoding';

function newAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

describe('шифрование строк', () => {
  it('круговой тест с кириллицей и эмодзи-нейтральным текстом', async () => {
    const key = await newAesKey();
    const text = 'Заметка про синхронизацию\nвторая строка';
    expect(await decryptString(key, await encryptString(key, text))).toBe(text);
  });

  it('пустая строка тоже переживает круг', async () => {
    const key = await newAesKey();
    expect(await decryptString(key, await encryptString(key, ''))).toBe('');
  });
});

describe('шифрование двоичных данных', () => {
  it('круговой тест для случайных байтов', async () => {
    const key = await newAesKey();
    const plain = crypto.getRandomValues(new Uint8Array(4096));
    expect(toHex(await decryptBytes(key, await encryptBytes(key, plain)))).toBe(toHex(plain));
  });

  it('круговой тест для ArrayBuffer', async () => {
    const key = await newAesKey();
    const plain = crypto.getRandomValues(new Uint8Array(1024));
    const restored = await decryptBuffer(key, await encryptBuffer(key, plain.buffer as ArrayBuffer));
    expect(toHex(new Uint8Array(restored))).toBe(toHex(plain));
  });

  it('IV случайный: два шифрования одного текста дают разные блобы', async () => {
    const key = await newAesKey();
    const first = await encryptBytes(key, new Uint8Array([1, 2, 3]));
    const second = await encryptBytes(key, new Uint8Array([1, 2, 3]));
    expect(toHex(first.subarray(0, IV_BYTES))).not.toBe(toHex(second.subarray(0, IV_BYTES)));
    expect(toHex(first)).not.toBe(toHex(second));
    expect(first.length).toBe(IV_BYTES + 3 + 16);
  });
});

describe('отказы расшифровки', () => {
  it('чужой ключ не расшифровывает', async () => {
    const key = await newAesKey();
    const alien = await newAesKey();
    const blob = await encryptString(key, 'секрет');
    await expect(decryptString(alien, blob)).rejects.toThrow('расшифровка не удалась');
  });

  it('испорченный шифротекст не проходит проверку GCM', async () => {
    const key = await newAesKey();
    const blob = await encryptString(key, 'секрет');
    const damaged = blob.slice();
    const last = damaged.length - 1;
    damaged[last] = (damaged[last] ?? 0) ^ 0xff;
    await expect(decryptString(key, damaged)).rejects.toThrow('расшифровка не удалась');
  });

  it('блоб короче IV отвергается до вызова WebCrypto', async () => {
    const key = await newAesKey();
    await expect(decryptBytes(key, new Uint8Array(IV_BYTES))).rejects.toThrow('короче IV');
  });
});
