import { expect } from 'vitest';
import { ulid } from 'ulid';
import { uploadBlobResponseSchema, type PutDocRequest, type Role, type UploadBlobResponse } from '@vaultwire/shared';
import { hashToken } from '#plugins/token-cache';
import { bodyOf, createClient, metaOf, type SpaceClient } from './client';
import type { Harness } from './harness';

/** Соль и верификатор здесь произвольные: сервер их не расшифровывает. */
const SALT = Buffer.alloc(32, 7).toString('base64');
const VERIFIER = Buffer.from('vaultwire-v1:тест').toString('base64');

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024;

export type SpaceFixture = {
  spaceId: string;
  owner: SpaceClient;
  writer: SpaceClient;
  reader: SpaceClient;
  ownerDeviceId: string;
  writerDeviceId: string;
  readerDeviceId: string;
};

type AddedDevice = { deviceId: string; client: SpaceClient };

/**
 * Устройство заводится прямо в базе: активация инвайта это отдельный сценарий,
 * а здесь нужен только рабочий токен с нужной ролью.
 */
async function addDevice(harness: Harness, spaceId: string, role: Role): Promise<AddedDevice> {
  const deviceId = ulid();
  const token = `${role}.${ulid()}`;
  await harness.prisma.device.create({
    data: { id: deviceId, spaceId, tokenHash: hashToken(token), role, label: `тест ${role}` },
  });
  return { deviceId, client: createClient(harness.app, spaceId, token) };
}

/** Своё пространство на каждый тест: наборы не мешают друг другу и чистятся разом. */
export async function createSpaceFixture(
  harness: Harness,
  quotaBytes: number = DEFAULT_QUOTA_BYTES,
): Promise<SpaceFixture> {
  const spaceId = ulid();
  await harness.prisma.space.create({
    data: { id: spaceId, salt: SALT, verifier: VERIFIER, quotaBytes: BigInt(quotaBytes) },
  });
  harness.track(spaceId);

  const owner = await addDevice(harness, spaceId, 'owner');
  const writer = await addDevice(harness, spaceId, 'rw');
  const reader = await addDevice(harness, spaceId, 'ro');

  return {
    spaceId,
    owner: owner.client,
    writer: writer.client,
    reader: reader.client,
    ownerDeviceId: owner.deviceId,
    writerDeviceId: writer.deviceId,
    readerDeviceId: reader.deviceId,
  };
}

/** Заливка тела с проверкой ответа: 201 на новое, 200 на уже лежащее. */
export async function uploadBlobOk(client: SpaceClient, data: Buffer): Promise<UploadBlobResponse> {
  const response = await client.uploadBlob(data);
  expect([200, 201]).toContain(response.statusCode);
  return bodyOf(response, uploadBlobResponseSchema);
}

/** Тело запроса записи документа поверх уже залитого тела. */
export function docBody(name: string, blob: UploadBlobResponse): PutDocRequest {
  return { metaCipher: metaOf(name), blobHash: blob.hash, size: blob.size };
}
