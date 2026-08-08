import { z } from 'zod';
import { blobHashSchema, spaceIdSchema } from '../protocol.js';
import { byteSizeSchema } from './common.js';

/** Заголовок с хешем тела, сервер пересчитывает SHA-256 сам и сверяет. */
export const BLOB_HASH_HEADER = 'x-blob-sha256';

export const uploadBlobHeadersSchema = z.object({
  [BLOB_HASH_HEADER]: blobHashSchema,
});
export type UploadBlobHeaders = z.infer<typeof uploadBlobHeadersSchema>;

/** POST /v1/spaces/{id}/blobs — сырое шифротело, 201 новое, 200 уже было. */
export const uploadBlobResponseSchema = z.object({
  hash: blobHashSchema,
  size: byteSizeSchema,
});
export type UploadBlobResponse = z.infer<typeof uploadBlobResponseSchema>;

/** Путь вида /v1/spaces/{id}/blobs/{hash}, ответ отдаётся сырым телом. */
export const blobParamsSchema = z.object({
  id: spaceIdSchema,
  hash: blobHashSchema,
});
export type BlobParams = z.infer<typeof blobParamsSchema>;
