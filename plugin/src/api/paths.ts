import type { BlobHash, DeviceId, DocId, SpaceId } from '@vaultwire/shared';

/** Пути эндпоинтов раздела 3 спецификации. Собраны в одном месте, чтобы не разъезжались. */
const SPACES = '/v1/spaces';

export const spacesPath = (): string => SPACES;
export const spacePath = (id: SpaceId): string => `${SPACES}/${enc(id)}`;
export const changesPath = (id: SpaceId): string => `${spacePath(id)}/changes`;

export const blobsPath = (id: SpaceId): string => `${spacePath(id)}/blobs`;
export const blobPath = (id: SpaceId, hash: BlobHash): string => `${blobsPath(id)}/${enc(hash)}`;

export const docsPath = (id: SpaceId): string => `${spacePath(id)}/docs`;
export const docPath = (id: SpaceId, docId: DocId): string => `${docsPath(id)}/${enc(docId)}`;
export const revisionsPath = (id: SpaceId, docId: DocId): string =>
  `${docPath(id, docId)}/revisions`;
/** Двоеточие часть имени эндпоинта, кодировать его нельзя. */
export const batchDocsPath = (id: SpaceId): string => `${docsPath(id)}:batch`;
export const movesPath = (id: SpaceId): string => `${spacePath(id)}/moves`;

export const devicesPath = (id: SpaceId): string => `${spacePath(id)}/devices`;
export const revokeDevicePath = (id: SpaceId, did: DeviceId): string =>
  `${devicesPath(id)}/${enc(did)}/revoke`;
export const invitesPath = (id: SpaceId): string => `${spacePath(id)}/invites`;

function enc(value: string): string {
  return encodeURIComponent(value);
}
