import { describe, expect, it } from 'vitest';
import { docWriteResultSchema, getSpaceResponseSchema } from '@vaultwire/shared';
import { HttpClient } from '../http';
import { InvalidResponseError, NetworkError } from '../errors';
import { fakeRequest, recordingSleep } from './fake-request';

const OK_WRITE = JSON.stringify({ rev: 3, seq: 12 });

function clientFor(replies: Parameters<typeof fakeRequest>[0], token = 'device-token') {
  const request = fakeRequest(replies);
  const http = new HttpClient({
    baseUrl: 'https://obsidian.boostix.space/',
    token,
    request: request.fn,
    retry: { sleep: recordingSleep().sleep, random: () => 1 },
  });
  return { http, calls: request.calls };
}

describe('сборка запроса', () => {
  it('базовый URL, путь и query склеиваются, токен уходит в Authorization', async () => {
    const { http, calls } = clientFor([{ status: 200, body: OK_WRITE }]);
    await http.json(
      { method: 'GET', path: '/v1/spaces/s1/changes', query: { since: 7, limit: undefined } },
      docWriteResultSchema,
    );
    expect(calls[0]?.url).toBe('https://obsidian.boostix.space/v1/spaces/s1/changes?since=7');
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer device-token');
    expect(calls[0]?.throw).toBe(false);
  });

  it('пустой токен не даёт заголовка авторизации', async () => {
    const { http, calls } = clientFor([{ status: 200, body: OK_WRITE }]);
    await http.json({ method: 'POST', path: '/v1/spaces', json: { a: 1 }, token: '' }, docWriteResultSchema);
    expect(calls[0]?.headers?.['authorization']).toBeUndefined();
    expect(calls[0]?.body).toBe('{"a":1}');
    expect(calls[0]?.contentType).toBe('application/json');
  });

  it('бинарное тело уходит как есть', async () => {
    const { http, calls } = clientFor([{ status: 201, body: JSON.stringify({ hash: 'a'.repeat(64), size: 4 }) }]);
    const body = new Uint8Array([1, 2, 3, 4]).buffer;
    const result = await http.jsonWithStatus(
      { method: 'POST', path: '/v1/spaces/s1/blobs', binary: body, headers: { 'x-blob-sha256': 'a'.repeat(64) } },
      { parse: (value: unknown): unknown => value },
    );
    expect(calls[0]?.body).toBe(body);
    expect(calls[0]?.contentType).toBe('application/octet-stream');
    expect(result.status).toBe(201);
  });

  it('бинарный ответ отдаётся буфером', async () => {
    const binary = new Uint8Array([9, 9]).buffer;
    const { http } = clientFor([{ status: 200, binary }]);
    await expect(http.binary({ method: 'GET', path: '/blob' })).resolves.toBe(binary);
  });
});

describe('проверка ответа схемой', () => {
  it('ответ не по схеме даёт InvalidResponseError без повтора', async () => {
    const { http, calls } = clientFor([{ status: 200, body: JSON.stringify({ rev: 'три', seq: 12 }) }]);
    await expect(http.json({ method: 'GET', path: '/doc' }, docWriteResultSchema)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
    expect(calls).toHaveLength(1);
  });

  it('неполный ответ не проходит схему пространства', async () => {
    const { http } = clientFor([{ status: 200, body: JSON.stringify({ seq: 1, role: 'rw' }) }]);
    await expect(http.json({ method: 'GET', path: '/space' }, getSpaceResponseSchema)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('тело не в JSON даёт InvalidResponseError', async () => {
    const { http } = clientFor([{ status: 200, body: '<html>ok</html>' }]);
    await expect(http.json({ method: 'GET', path: '/doc' }, docWriteResultSchema)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('годный ответ возвращается разобранным', async () => {
    const { http } = clientFor([{ status: 200, body: OK_WRITE }]);
    await expect(http.json({ method: 'PUT', path: '/doc' }, docWriteResultSchema)).resolves.toEqual({
      rev: 3,
      seq: 12,
    });
  });

  it('отказ транспорта доходит как NetworkError', async () => {
    const { http } = clientFor([{ status: 0, throws: new Error('оборвалось') }]);
    await expect(http.json({ method: 'GET', path: '/doc' }, docWriteResultSchema)).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
