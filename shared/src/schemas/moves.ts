import { z } from 'zod';
import { blobHashSchema, docIdSchema } from '../protocol.js';
import { base64Schema, revSchema, seqSchema } from './common.js';

/**
 * POST /v1/spaces/{id}/moves — переименование одной транзакцией.
 * Пара из удаления и создания дала бы окно, в котором другой участник удалит файл у себя.
 */
export const moveDocRequestSchema = z.object({
  fromDocId: docIdSchema,
  fromRev: revSchema,
  toDocId: docIdSchema,
  metaCipher: base64Schema,
  blobHash: blobHashSchema,
});
export type MoveDocRequest = z.infer<typeof moveDocRequestSchema>;

/** rev и seq относятся к документу назначения. */
export const moveDocResponseSchema = z.object({
  rev: revSchema,
  seq: seqSchema,
});
export type MoveDocResponse = z.infer<typeof moveDocResponseSchema>;
