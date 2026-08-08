import { CONNECTION_CODE_PREFIX } from '@vaultwire/shared';
import type { ConnectionCodePayload, SpaceId } from '@vaultwire/shared';
import { describe, expect, it } from 'vitest';
import { toBase64Url, utf8Encode } from '../../../crypto';
import { buildConnectionCode, parseConnectionCode, serverHost } from '../code';

const PAYLOAD: ConnectionCodePayload = {
  u: 'https://obsidian.boostix.space',
  s: 'space-1' as SpaceId,
  i: 'invite-code',
};

function encode(value: unknown): string {
  return CONNECTION_CODE_PREFIX + toBase64Url(utf8Encode(JSON.stringify(value)));
}

describe('parseConnectionCode', () => {
  it('разбирает собственный код', () => {
    const parsed = parseConnectionCode(buildConnectionCode(PAYLOAD));
    expect(parsed).toEqual({ ok: true, payload: PAYLOAD });
  });

  it('терпит переносы строк и пробелы из письма', () => {
    const code = buildConnectionCode(PAYLOAD);
    const wrapped = `  ${code.slice(0, 10)}\n${code.slice(10)}  `;
    expect(parseConnectionCode(wrapped)).toEqual({ ok: true, payload: PAYLOAD });
  });

  it('пустая строка отличается от испорченного кода', () => {
    expect(parseConnectionCode('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('чужой префикс называется отдельно', () => {
    expect(parseConnectionCode('vw2:AAAA')).toEqual({ ok: false, error: 'prefix' });
    expect(parseConnectionCode('https://example.org/invite')).toEqual({ ok: false, error: 'prefix' });
  });

  it('не base64url — ошибка кодировки', () => {
    expect(parseConnectionCode('vw1:до свидания')).toEqual({ ok: false, error: 'base64' });
    expect(parseConnectionCode('vw1:')).toEqual({ ok: false, error: 'base64' });
    expect(parseConnectionCode('vw1:a+b/c=')).toEqual({ ok: false, error: 'base64' });
  });

  it('разобранный base64 без JSON — ошибка содержимого', () => {
    expect(parseConnectionCode(CONNECTION_CODE_PREFIX + toBase64Url(utf8Encode('не json')))).toEqual({
      ok: false,
      error: 'json',
    });
  });

  it('неполный набор полей — ошибка схемы', () => {
    expect(parseConnectionCode(encode({ u: 'https://example.org', s: 'space-1' }))).toEqual({
      ok: false,
      error: 'shape',
    });
    expect(parseConnectionCode(encode({ ...PAYLOAD, u: 'не-url' }))).toEqual({
      ok: false,
      error: 'shape',
    });
    expect(parseConnectionCode(encode({ ...PAYLOAD, i: '' }))).toEqual({ ok: false, error: 'shape' });
  });
});

describe('serverHost', () => {
  it('показывает хост, а неразобранный адрес отдаёт как есть', () => {
    expect(serverHost('https://obsidian.boostix.space/v1')).toBe('obsidian.boostix.space');
    expect(serverHost('мусор')).toBe('мусор');
  });
});
