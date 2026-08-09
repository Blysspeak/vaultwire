import { describe, expect, it } from 'vitest';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type { ConnectionCodePayload } from '@vaultwire/shared';
import { activateInvite } from '../join';

const PAYLOAD = {
  u: 'https://example.org',
  s: '01KZHS2ZNJHXQP12B1B51H3D4A',
  i: 'invite-code',
} as unknown as ConnectionCodePayload;

const DEVICE = {
  deviceId: 'dev-1',
  deviceToken: 'выданный-токен',
  salt: 'c2FsdA==',
  verifier: 'dmVyaWZpZXI=',
  epoch: 0,
  role: 'rw',
};

/** Фейковый транспорт: копит заголовки, чтобы проверить, с чем уходит второй запрос. */
function transport(): { calls: Array<{ url: string; auth: string }>; request: (param: RequestUrlParam) => Promise<RequestUrlResponse> } {
  const calls: Array<{ url: string; auth: string }> = [];
  return {
    calls,
    request: (param) => {
      const headers = param.headers ?? {};
      calls.push({ url: param.url, auth: headers['authorization'] ?? '' });
      const body = param.url.endsWith('/devices') ? JSON.stringify(DEVICE) : JSON.stringify({ seq: 0, items: [] });
      return Promise.resolve({
        status: 200,
        text: body,
        json: JSON.parse(body),
        arrayBuffer: new ArrayBuffer(0),
        headers: {},
      } as unknown as RequestUrlResponse);
    },
  };
}

describe('активация инвайта', () => {
  it('сама идёт без токена: он этим запросом и выдаётся', async () => {
    const net = transport();
    await activateInvite(PAYLOAD, 'телефон', net.request);
    expect(net.calls[0]?.auth).toBe('');
  });

  it('возвращает клиент с выданным токеном, а не тот же анонимный', async () => {
    const net = transport();
    const result = await activateInvite(PAYLOAD, 'телефон', net.request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Первый же запрос после активации: без токена сервер ответил бы 401, и мастер
    // падал бы на построении плана сразу после успешного ввода пароля.
    await result.joined.client.getChanges(PAYLOAD.s);
    expect(net.calls.at(-1)?.auth).toBe(`Bearer ${DEVICE.deviceToken}`);
  });
});
