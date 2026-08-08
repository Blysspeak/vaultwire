import {
  BLOB_HASH_HEADER,
  batchDocsResponseSchema,
  changesResponseSchema,
  createInviteResponseSchema,
  createSpaceResponseSchema,
  deleteDocResponseSchema,
  docWriteResultSchema,
  getSpaceResponseSchema,
  joinSpaceResponseSchema,
  listDevicesResponseSchema,
  listRevisionsResponseSchema,
  moveDocResponseSchema,
  revokeDeviceResponseSchema,
  uploadBlobResponseSchema,
} from '@vaultwire/shared';
// Типы протокола берём пространством имён: их полтора десятка, поимённый список занял бы экран.
import type * as vw from '@vaultwire/shared';
import { HttpClient } from './http';
import type { HttpClientOptions, HttpResult } from './http';
import * as paths from './paths';

/**
 * Тело создания пространства. Верификатор зависит от spaceId, который выдаёт
 * сервер, поэтому при создании он необязателен и доезжает отдельным PATCH.
 */
export type CreateSpaceBody = Omit<vw.CreateSpaceRequest, 'salt' | 'verifier'> &
  Partial<Pick<vw.CreateSpaceRequest, 'salt' | 'verifier'>>;

/** Клиент протокола раздела 3. Каждый ответ проходит схему shared перед возвратом. */
export class VaultwireClient {
  constructor(private readonly http: HttpClient) {}

  /** POST /v1/spaces, авторизация bootstrap-токеном сервера. */
  createSpace(request: CreateSpaceBody, bootstrapToken: string): Promise<vw.CreateSpaceResponse> {
    const path = paths.spacesPath();
    return this.http.json(
      { method: 'POST', path, json: request, token: bootstrapToken },
      createSpaceResponseSchema,
    );
  }

  /** POST /v1/spaces/{id}/devices — активация инвайта, токена устройства ещё нет. */
  joinSpace(spaceId: vw.SpaceId, request: vw.JoinSpaceRequest): Promise<vw.JoinSpaceResponse> {
    const path = paths.devicesPath(spaceId);
    return this.http.json({ method: 'POST', path, json: request, token: '' }, joinSpaceResponseSchema);
  }

  getSpace(spaceId: vw.SpaceId): Promise<vw.GetSpaceResponse> {
    const path = paths.spacePath(spaceId);
    return this.http.json({ method: 'GET', path }, getSpaceResponseSchema);
  }

  /** PATCH /v1/spaces/{id} — установка верификатора сразу после создания, только владелец. */
  setSpaceVerifier(spaceId: vw.SpaceId, verifier: string): Promise<vw.GetSpaceResponse> {
    const path = paths.spacePath(spaceId);
    return this.http.json({ method: 'PATCH', path, json: { verifier } }, getSpaceResponseSchema);
  }

  /** GET /v1/spaces/{id}/changes — только метаданные, тела тянутся отдельно. */
  getChanges(spaceId: vw.SpaceId, query: Partial<vw.ChangesQuery> = {}): Promise<vw.ChangesResponse> {
    const path = paths.changesPath(spaceId);
    return this.http.json({ method: 'GET', path, query }, changesResponseSchema);
  }

  /** POST /v1/spaces/{id}/blobs — сырое шифротело. Статус 201 новое, 200 уже было. */
  uploadBlob(
    spaceId: vw.SpaceId,
    hash: vw.BlobHash,
    body: ArrayBuffer,
  ): Promise<HttpResult<vw.UploadBlobResponse>> {
    const path = paths.blobsPath(spaceId);
    const headers = { [BLOB_HASH_HEADER]: hash };
    return this.http.jsonWithStatus(
      { method: 'POST', path, binary: body, headers },
      uploadBlobResponseSchema,
    );
  }

  downloadBlob(spaceId: vw.SpaceId, hash: vw.BlobHash): Promise<ArrayBuffer> {
    return this.http.binary({ method: 'GET', path: paths.blobPath(spaceId, hash) });
  }

  /** PUT /v1/spaces/{id}/docs/{docId}. expectedRev = null означает создание. */
  putDoc(
    spaceId: vw.SpaceId,
    docId: vw.DocId,
    request: vw.PutDocRequest,
    expectedRev: vw.Rev | null,
  ): Promise<vw.DocWriteResult> {
    const path = paths.docPath(spaceId, docId);
    const headers = conditionalHeaders(expectedRev);
    return this.http.json({ method: 'PUT', path, json: request, headers }, docWriteResultSchema);
  }

  /** POST /v1/spaces/{id}/docs:batch — до 50 документов, ошибка по одному не рушит остальные. */
  batchDocs(spaceId: vw.SpaceId, request: vw.BatchDocsRequest): Promise<vw.BatchDocsResponse> {
    const path = paths.batchDocsPath(spaceId);
    return this.http.json({ method: 'POST', path, json: request }, batchDocsResponseSchema);
  }

  /** POST /v1/spaces/{id}/moves — переезд одной транзакцией, не парой удаления и создания. */
  moveDoc(spaceId: vw.SpaceId, request: vw.MoveDocRequest): Promise<vw.MoveDocResponse> {
    const path = paths.movesPath(spaceId);
    return this.http.json({ method: 'POST', path, json: request }, moveDocResponseSchema);
  }

  /** DELETE /v1/spaces/{id}/docs/{docId} — надгробие, тело живёт срок хранения. */
  deleteDoc(spaceId: vw.SpaceId, docId: vw.DocId, expectedRev: vw.Rev): Promise<vw.DeleteDocResponse> {
    const path = paths.docPath(spaceId, docId);
    const headers = conditionalHeaders(expectedRev);
    return this.http.json({ method: 'DELETE', path, headers }, deleteDocResponseSchema);
  }

  listRevisions(spaceId: vw.SpaceId, docId: vw.DocId): Promise<vw.ListRevisionsResponse> {
    const path = paths.revisionsPath(spaceId, docId);
    return this.http.json({ method: 'GET', path }, listRevisionsResponseSchema);
  }

  createInvite(spaceId: vw.SpaceId, request: vw.CreateInviteRequest): Promise<vw.CreateInviteResponse> {
    const path = paths.invitesPath(spaceId);
    return this.http.json({ method: 'POST', path, json: request }, createInviteResponseSchema);
  }

  listDevices(spaceId: vw.SpaceId): Promise<vw.ListDevicesResponse> {
    const path = paths.devicesPath(spaceId);
    return this.http.json({ method: 'GET', path }, listDevicesResponseSchema);
  }

  revokeDevice(spaceId: vw.SpaceId, deviceId: vw.DeviceId): Promise<vw.RevokeDeviceResponse> {
    const path = paths.revokeDevicePath(spaceId, deviceId);
    return this.http.json({ method: 'POST', path }, revokeDeviceResponseSchema);
  }
}

export function createClient(options: HttpClientOptions): VaultwireClient {
  return new VaultwireClient(new HttpClient(options));
}

/** Условная запись: If-Match с rev для обновления, If-None-Match со звёздочкой для создания. */
function conditionalHeaders(expectedRev: vw.Rev | null): Record<string, string> {
  return expectedRev === null ? { 'if-none-match': '*' } : { 'if-match': String(expectedRev) };
}
