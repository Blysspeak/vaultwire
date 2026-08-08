import { createHash } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { ZodTypeAny } from 'zod';
import {
  BLOB_HASH_HEADER,
  base64Schema,
  blobHashSchema,
  docIdSchema,
  protocolErrorBodySchema,
  type BatchDocItem,
  type BlobHash,
  type CreateInviteRequest,
  type DocId,
  type MoveDocRequest,
  type ProtocolErrorBody,
  type PutDocRequest,
} from '@vaultwire/shared';

const OCTET_STREAM = 'application/octet-stream';

export type Response = LightMyRequestResponse;

/** docId это base64url от 32 байт: sha256 имени даёт ровно нужные 43 символа. */
export function docIdOf(name: string): DocId {
  return docIdSchema.parse(createHash('sha256').update(name).digest('base64url'));
}

/** Метаданные тестам расшифровывать не нужно, важен только формат base64. */
export function metaOf(name: string): string {
  return base64Schema.parse(Buffer.from(`meta:${name}`).toString('base64'));
}

export function sha256Hex(data: Buffer): BlobHash {
  return blobHashSchema.parse(createHash('sha256').update(data).digest('hex'));
}

/** Условие записи: номер ревизии в If-Match либо создание через If-None-Match. */
export type WriteCondition = number | 'create';

function conditionHeaders(condition: WriteCondition): Record<string, string> {
  return condition === 'create' ? { 'if-none-match': '*' } : { 'if-match': String(condition) };
}

/**
 * Разбор ответа схемой из shared: свои копии типов протокола тестам не нужны.
 * Тип берётся из выхода схемы, иначе бренды DocId и BlobHash терялись бы на входе.
 */
export function bodyOf<S extends ZodTypeAny>(response: Response, schema: S): S['_output'] {
  return schema.parse(response.json());
}

export function errorOf(response: Response): ProtocolErrorBody {
  return protocolErrorBodySchema.parse(response.json());
}

export type SpaceClient = {
  space: () => Promise<Response>;
  changes: (since?: number) => Promise<Response>;
  uploadBlob: (data: Buffer) => Promise<Response>;
  readBlob: (hash: string) => Promise<Response>;
  putDoc: (docId: DocId, body: PutDocRequest, condition: WriteCondition) => Promise<Response>;
  deleteDoc: (docId: DocId, rev: number) => Promise<Response>;
  batch: (items: BatchDocItem[]) => Promise<Response>;
  move: (body: MoveDocRequest) => Promise<Response>;
  createInvite: (body: CreateInviteRequest) => Promise<Response>;
  listDevices: () => Promise<Response>;
  revokeDevice: (deviceId: string) => Promise<Response>;
};

/** Клиент одного устройства: путь пространства и заголовок токена уже подставлены. */
export function createClient(app: FastifyInstance, spaceId: string, token: string): SpaceClient {
  const base = `/v1/spaces/${spaceId}`;
  const auth = { authorization: `Bearer ${token}` };

  return {
    space: () => app.inject({ method: 'GET', url: base, headers: auth }),

    changes: (since = 0) => app.inject({ method: 'GET', url: `${base}/changes?since=${since}`, headers: auth }),

    uploadBlob: (data) =>
      app.inject({
        method: 'POST',
        url: `${base}/blobs`,
        headers: { ...auth, 'content-type': OCTET_STREAM, [BLOB_HASH_HEADER]: sha256Hex(data) },
        payload: data,
      }),

    readBlob: (hash) => app.inject({ method: 'GET', url: `${base}/blobs/${hash}`, headers: auth }),

    putDoc: (docId, body, condition) =>
      app.inject({
        method: 'PUT',
        url: `${base}/docs/${docId}`,
        headers: { ...auth, ...conditionHeaders(condition) },
        payload: body,
      }),

    deleteDoc: (docId, rev) =>
      app.inject({
        method: 'DELETE',
        url: `${base}/docs/${docId}`,
        headers: { ...auth, 'if-match': String(rev) },
      }),

    // Двойное двоеточие в шаблоне роута даёт литеральный путь /docs:batch.
    batch: (items) => app.inject({ method: 'POST', url: `${base}/docs:batch`, headers: auth, payload: { items } }),

    move: (body) => app.inject({ method: 'POST', url: `${base}/moves`, headers: auth, payload: body }),

    createInvite: (body) => app.inject({ method: 'POST', url: `${base}/invites`, headers: auth, payload: body }),

    listDevices: () => app.inject({ method: 'GET', url: `${base}/devices`, headers: auth }),

    revokeDevice: (deviceId) =>
      app.inject({ method: 'POST', url: `${base}/devices/${deviceId}/revoke`, headers: auth }),
  };
}
