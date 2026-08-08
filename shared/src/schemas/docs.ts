import { z } from 'zod';
import { blobHashSchema, docIdSchema, spaceIdSchema, PROTOCOL_LIMITS } from '../protocol.js';
import { protocolErrorBodySchema } from '../errors.js';
import { base64Schema, byteSizeSchema, revSchema, seqSchema } from './common.js';

/** Путь вида /v1/spaces/{id}/docs/{docId}. */
export const docParamsSchema = z.object({
  id: spaceIdSchema,
  docId: docIdSchema,
});
export type DocParams = z.infer<typeof docParamsSchema>;

/** PUT /v1/spaces/{id}/docs/{docId}. Тело уже лежит в блобах, здесь только ссылка на него. */
export const putDocRequestSchema = z.object({
  metaCipher: base64Schema,
  blobHash: blobHashSchema,
  size: byteSizeSchema,
});
export type PutDocRequest = z.infer<typeof putDocRequestSchema>;

/** Общий ответ на любую запись документа: переезд и удаление отвечают тем же. */
export const docWriteResultSchema = z.object({
  rev: revSchema,
  seq: seqSchema,
});
export type DocWriteResult = z.infer<typeof docWriteResultSchema>;

/** DELETE /v1/spaces/{id}/docs/{docId} — надгробие, тело живёт срок хранения. */
export const deleteDocResponseSchema = docWriteResultSchema;
export type DeleteDocResponse = z.infer<typeof deleteDocResponseSchema>;

/**
 * Элемент POST /v1/spaces/{id}/docs:batch.
 * expectedRev = null означает создание, ровно как If-None-Match со звёздочкой.
 */
export const batchDocItemSchema = z.object({
  docId: docIdSchema,
  metaCipher: base64Schema,
  blobHash: blobHashSchema,
  size: byteSizeSchema,
  expectedRev: revSchema.nullable(),
});
export type BatchDocItem = z.infer<typeof batchDocItemSchema>;

export const batchDocsRequestSchema = z.object({
  items: z.array(batchDocItemSchema).min(1).max(PROTOCOL_LIMITS.batchMaxDocs),
});
export type BatchDocsRequest = z.infer<typeof batchDocsRequestSchema>;

/** Результат по одному документу: успех или ошибка, остальные при этом применяются. */
export const batchDocResultSchema = z.union([
  z.object({ docId: docIdSchema, rev: revSchema, seq: seqSchema }),
  z.object({ docId: docIdSchema, error: protocolErrorBodySchema }),
]);
export type BatchDocResult = z.infer<typeof batchDocResultSchema>;

export const batchDocsResponseSchema = z.array(batchDocResultSchema);
export type BatchDocsResponse = z.infer<typeof batchDocsResponseSchema>;
