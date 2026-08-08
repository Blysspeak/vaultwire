import type { SpaceId } from '@vaultwire/shared';
import { describe, expect, it } from 'vitest';
import { VERIFIER_PREFIX, checkVerifier, createVerifier, verifierPlaintext } from './verifier';

const SPACE = 'sp_team' as SpaceId;
const OTHER_SPACE = 'sp_other' as SpaceId;

function newAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

describe('верификатор пароля', () => {
  it('открытый текст собирается по спецификации', () => {
    expect(verifierPlaintext(SPACE)).toBe(`${VERIFIER_PREFIX}sp_team`);
  });

  it('свой ключ проходит проверку', async () => {
    const key = await newAesKey();
    expect(await checkVerifier(key, SPACE, await createVerifier(key, SPACE))).toBe(true);
  });

  it('чужой ключ не проходит', async () => {
    const key = await newAesKey();
    const alien = await newAesKey();
    expect(await checkVerifier(alien, SPACE, await createVerifier(key, SPACE))).toBe(false);
  });

  it('верификатор чужого пространства не проходит', async () => {
    const key = await newAesKey();
    expect(await checkVerifier(key, OTHER_SPACE, await createVerifier(key, SPACE))).toBe(false);
  });

  it('мусор вместо верификатора не роняет проверку', async () => {
    const key = await newAesKey();
    expect(await checkVerifier(key, SPACE, 'не base64 вовсе')).toBe(false);
    expect(await checkVerifier(key, SPACE, '')).toBe(false);
  });
});
