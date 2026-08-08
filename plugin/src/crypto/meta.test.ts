import { describe, expect, it } from 'vitest';
import type { DocMeta } from './meta';
import { decryptMeta, encryptMeta, parseMeta, serializeMeta } from './meta';

const META: DocMeta = {
  path: 'Проекты/план.md',
  mtime: 1_754_600_000_000,
  ctime: 1_754_500_000_000,
  size: 128,
  plainSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  deviceLabel: 'Ноутбук Иры',
  op: 'update',
};

function newAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

describe('сериализация метаданных', () => {
  it('порядок ключей фиксирован', () => {
    const shuffled: DocMeta = {
      op: META.op,
      deviceLabel: META.deviceLabel,
      plainSha256: META.plainSha256,
      size: META.size,
      ctime: META.ctime,
      mtime: META.mtime,
      path: META.path,
    };
    expect(serializeMeta(shuffled)).toBe(serializeMeta(META));
    expect(Object.keys(JSON.parse(serializeMeta(META)) as object)).toEqual([
      'path',
      'mtime',
      'ctime',
      'size',
      'plainSha256',
      'deviceLabel',
      'op',
    ]);
  });

  it('разбор возвращает исходную запись', () => {
    expect(parseMeta(serializeMeta(META))).toEqual(META);
  });

  it('отвергает неполные и повреждённые метаданные', () => {
    expect(() => parseMeta('{')).toThrow('не разбираются');
    expect(() => parseMeta('null')).toThrow('не объект');
    expect(() => parseMeta('{"path":"a.md"}')).toThrow('неполные');
    const unknownOp = serializeMeta(META).replace('"op":"update"', '"op":"rename"');
    expect(() => parseMeta(unknownOp)).toThrow('неполные');
  });
});

describe('шифрование метаданных', () => {
  it('круговой тест через metaCipher', async () => {
    const key = await newAesKey();
    const cipher = await encryptMeta(key, META);
    expect(cipher).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(await decryptMeta(key, cipher)).toEqual(META);
  });

  it('чужой ключ не расшифровывает метаданные', async () => {
    const key = await newAesKey();
    const alien = await newAesKey();
    await expect(decryptMeta(alien, await encryptMeta(key, META))).rejects.toThrow(
      'расшифровка не удалась',
    );
  });
});
