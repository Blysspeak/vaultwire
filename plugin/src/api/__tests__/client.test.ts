import { describe, expect, it } from 'vitest';
import { blobHashSchema, deviceIdSchema, docIdSchema, spaceIdSchema } from '@vaultwire/shared';
import { HttpClient } from '../http';
import { VaultwireClient } from '../client';
import { fakeRequest } from './fake-request';
import type { FakeReply } from './fake-request';

const SPACE = spaceIdSchema.parse('space-1');
const DOC = docIdSchema.parse('a'.repeat(43));
const HASH = blobHashSchema.parse('b'.repeat(64));
const DEVICE = deviceIdSchema.parse('device-1');
const BASE = 'https://obsidian.boostix.space';
const WRITE = JSON.stringify({ rev: 4, seq: 9 });

function client(replies: readonly FakeReply[]) {
  const request = fakeRequest(replies);
  const http = new HttpClient({ baseUrl: BASE, token: 'device-token', request: request.fn });
  return { api: new VaultwireClient(http), calls: request.calls };
}

describe('эндпоинты пространства', () => {
  it('создание пространства идёт под bootstrap-токеном', async () => {
    const body = JSON.stringify({ spaceId: 'space-1', ownerToken: 'owner', salt: 'c2FsdA==' });
    const { api, calls } = client([{ status: 200, body }]);
    const result = await api.createSpace(
      { salt: 'c2FsdA==', verifier: 'dg==', deviceLabel: 'ноутбук' },
      'bootstrap',
    );
    expect(result.ownerToken).toBe('owner');
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces`);
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer bootstrap');
  });

  it('активация инвайта идёт без авторизации', async () => {
    const body = JSON.stringify({
      deviceId: 'device-1',
      deviceToken: 'tok',
      salt: 'c2FsdA==',
      verifier: 'dg==',
      epoch: 0,
      role: 'rw',
    });
    const { api, calls } = client([{ status: 200, body }]);
    const result = await api.joinSpace(SPACE, { invite: 'inv', label: 'телефон' });
    expect(result.role).toBe('rw');
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/devices`);
    expect(calls[0]?.headers?.['authorization']).toBeUndefined();
  });

  it('состояние пространства проходит схему', async () => {
    const body = JSON.stringify({
      seq: 42,
      role: 'owner',
      docCount: 3,
      bytes: 100,
      epoch: 0,
      salt: 'c2FsdA==',
      verifier: 'dg==',
      retentionDays: 30,
    });
    const { api, calls } = client([{ status: 200, body }]);
    await expect(api.getSpace(SPACE)).resolves.toMatchObject({ seq: 42, role: 'owner' });
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1`);
  });

  it('догон изменений передаёт since и limit', async () => {
    const body = JSON.stringify({ seq: 7, items: [] });
    const { api, calls } = client([{ status: 200, body }]);
    await api.getChanges(SPACE, { since: 5, limit: 200 });
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/changes?since=5&limit=200`);
  });
});

describe('эндпоинты документов и тел', () => {
  it('обновление документа шлёт If-Match', async () => {
    const { api, calls } = client([{ status: 200, body: WRITE }]);
    await api.putDoc(SPACE, DOC, { metaCipher: 'bQ==', blobHash: HASH, size: 10 }, 3);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/docs/${DOC}`);
    expect(calls[0]?.headers?.['if-match']).toBe('3');
  });

  it('создание документа шлёт If-None-Match', async () => {
    const { api, calls } = client([{ status: 200, body: WRITE }]);
    await api.putDoc(SPACE, DOC, { metaCipher: 'bQ==', blobHash: HASH, size: 10 }, null);
    expect(calls[0]?.headers?.['if-none-match']).toBe('*');
    expect(calls[0]?.headers?.['if-match']).toBeUndefined();
  });

  it('удаление шлёт If-Match', async () => {
    const { api, calls } = client([{ status: 200, body: WRITE }]);
    await expect(api.deleteDoc(SPACE, DOC, 4)).resolves.toEqual({ rev: 4, seq: 9 });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.headers?.['if-match']).toBe('4');
  });

  it('батч идёт на docs:batch без кодирования двоеточия', async () => {
    const body = JSON.stringify([{ docId: DOC, rev: 1, seq: 2 }]);
    const { api, calls } = client([{ status: 200, body }]);
    const items = [{ docId: DOC, metaCipher: 'bQ==', blobHash: HASH, size: 1, expectedRev: null }];
    await expect(api.batchDocs(SPACE, { items })).resolves.toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/docs:batch`);
  });

  it('переезд идёт одним запросом на moves', async () => {
    const { api, calls } = client([{ status: 200, body: WRITE }]);
    await api.moveDoc(SPACE, {
      fromDocId: DOC,
      fromRev: 2,
      toDocId: docIdSchema.parse('c'.repeat(43)),
      metaCipher: 'bQ==',
      blobHash: HASH,
    });
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/moves`);
  });

  it('загрузка тела шлёт хеш заголовком, 201 означает новое тело', async () => {
    const body = JSON.stringify({ hash: HASH, size: 2 });
    const { api, calls } = client([{ status: 201, body }]);
    const result = await api.uploadBlob(SPACE, HASH, new Uint8Array([1, 2]).buffer);
    expect(result.status).toBe(201);
    expect(calls[0]?.headers?.['x-blob-sha256']).toBe(HASH);
  });

  it('скачивание тела отдаёт буфер', async () => {
    const binary = new Uint8Array([7]).buffer;
    const { api, calls } = client([{ status: 200, binary }]);
    await expect(api.downloadBlob(SPACE, HASH)).resolves.toBe(binary);
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/blobs/${HASH}`);
  });

  it('отзыв устройства идёт по пути владельца', async () => {
    const body = JSON.stringify({ deviceId: DEVICE, revokedAt: 1 });
    const { api, calls } = client([{ status: 200, body }]);
    await api.revokeDevice(SPACE, DEVICE);
    expect(calls[0]?.url).toBe(`${BASE}/v1/spaces/space-1/devices/device-1/revoke`);
  });
});
