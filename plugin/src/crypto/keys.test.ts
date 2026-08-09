import { describe, expect, it } from 'vitest';
import {
  contentKeyInfo,
  deriveKeys,
  deriveMaster,
  metaKeyInfo,
  normalizePassword,
  pathKeyInfo,
} from './keys';
import { decryptString, encryptString } from './cipher';
import { toHex } from './encoding';

const SALT = new Uint8Array(32).fill(7);
const OTHER_SALT = new Uint8Array(32).fill(8);
const PASSWORD = 'общий пароль команды';
/** 650000 итераций PBKDF2 занимают около секунды на вызов. */
const SLOW = 60_000;

describe('deriveMaster', () => {
  it('даёт 32 байта и стабилен при одинаковых пароле и соли', async () => {
    const first = await deriveMaster(PASSWORD, SALT);
    const second = await deriveMaster(PASSWORD, SALT);
    expect(first.length).toBe(32);
    expect(toHex(first)).toBe(toHex(second));
  }, SLOW);

  it('меняется от соли и от пароля', async () => {
    const base = toHex(await deriveMaster(PASSWORD, SALT));
    expect(toHex(await deriveMaster(PASSWORD, OTHER_SALT))).not.toBe(base);
    expect(toHex(await deriveMaster(`${PASSWORD}!`, SALT))).not.toBe(base);
  }, SLOW);

  it('мусор по краям не меняет ключ: копирование из чата тащит таб и перевод строки', async () => {
    const base = toHex(await deriveMaster(PASSWORD, SALT));
    expect(toHex(await deriveMaster(`\t${PASSWORD}`, SALT))).toBe(base);
    expect(toHex(await deriveMaster(`${PASSWORD} `, SALT))).toBe(base);
    expect(toHex(await deriveMaster(` ${PASSWORD}\n`, SALT))).toBe(base);
  }, SLOW);
});

describe('normalizePassword', () => {
  it('срезает пробельный мусор по краям', () => {
    expect(normalizePassword('\tпароль ')).toBe('пароль');
    expect(normalizePassword('  пароль\r\n')).toBe('пароль');
  });

  it('внутренние пробелы сохраняет: они часть пароля', () => {
    expect(normalizePassword(' два слова ')).toBe('два слова');
  });

  it('приводит юникод к NFC: iOS отдаёт кириллицу в NFD', () => {
    const nfd = 'йёлка'.normalize('NFD');
    expect(nfd).not.toBe('йёлка');
    expect(normalizePassword(nfd)).toBe('йёлка');
  });
});

describe('deriveKeys', () => {
  it('строит непроизводные ключи нужных алгоритмов', async () => {
    const master = await deriveMaster(PASSWORD, SALT);
    const keys = await deriveKeys(master, 0);
    expect(keys.epoch).toBe(0);
    for (const key of [keys.contentKey, keys.metaKey, keys.pathKey]) {
      expect(key.extractable).toBe(false);
    }
    expect(keys.contentKey.algorithm.name).toBe('AES-GCM');
    expect(keys.metaKey.algorithm.name).toBe('AES-GCM');
    expect(keys.pathKey.algorithm.name).toBe('HMAC');
  }, SLOW);

  it('из одного master даёт взаимозаменяемые ключи, а из разных эпох — нет', async () => {
    const master = await deriveMaster(PASSWORD, SALT);
    const first = await deriveKeys(master, 0);
    const second = await deriveKeys(master, 0);
    const nextEpoch = await deriveKeys(master, 1);

    const blob = await encryptString(first.contentKey, 'текст');
    await expect(decryptString(second.contentKey, blob)).resolves.toBe('текст');
    await expect(decryptString(nextEpoch.contentKey, blob)).rejects.toThrow();
  }, SLOW);

  it('разводит content, meta и path по разным info', async () => {
    const master = await deriveMaster(PASSWORD, SALT);
    const keys = await deriveKeys(master, 0);
    const blob = await encryptString(keys.contentKey, 'текст');
    await expect(decryptString(keys.metaKey, blob)).rejects.toThrow();

    expect(contentKeyInfo(3)).toBe('vw:content:v1:3');
    expect(metaKeyInfo(3)).toBe('vw:meta:v1:3');
    expect(pathKeyInfo(3)).toBe('vw:path:v1:3');
  }, SLOW);
});
