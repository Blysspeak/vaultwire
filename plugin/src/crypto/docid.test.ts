import { describe, expect, it } from 'vitest';
import { computeDocId, normalizeRelPath } from './docid';

function newHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [
    'sign',
    'verify',
  ]) as Promise<CryptoKey>;
}

describe('normalizeRelPath', () => {
  it('приводит разделители и убирает ведущий слэш', () => {
    expect(normalizeRelPath('\\Проекты\\план.md')).toBe('Проекты/план.md');
    expect(normalizeRelPath('/Проекты//план.md')).toBe('Проекты/план.md');
    expect(normalizeRelPath('./Проекты/план.md')).toBe('Проекты/план.md');
  });

  it('нормализует в NFC', () => {
    const nfd = 'Заметки/йога.md'.normalize('NFD');
    expect(nfd).not.toBe('Заметки/йога.md');
    expect(normalizeRelPath(nfd)).toBe('Заметки/йога.md');
  });
});

describe('computeDocId', () => {
  it('детерминирован для одного пути и различает разные', async () => {
    const key = await newHmacKey();
    const first = await computeDocId(key, 'Проекты/план.md');
    const second = await computeDocId(key, 'Проекты/план.md');
    const other = await computeDocId(key, 'Проекты/план 2.md');
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  it('даёт base64url от 32 байт, ровно 43 символа', async () => {
    const key = await newHmacKey();
    expect(await computeDocId(key, 'план.md')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('NFC и NFD варианты кириллицы дают один docId', async () => {
    const key = await newHmacKey();
    const nfc = 'Заметки/йога и ёлка.md'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(await computeDocId(key, nfd)).toBe(await computeDocId(key, nfc));
  });

  it('ведущий слэш и обратные слэши не меняют адрес', async () => {
    const key = await newHmacKey();
    const base = await computeDocId(key, 'Проекты/план.md');
    expect(await computeDocId(key, '/Проекты/план.md')).toBe(base);
    expect(await computeDocId(key, 'Проекты\\план.md')).toBe(base);
  });

  it('разные ключи путей дают разные адреса одного пути', async () => {
    const first = await computeDocId(await newHmacKey(), 'план.md');
    const second = await computeDocId(await newHmacKey(), 'план.md');
    expect(first).not.toBe(second);
  });
});
