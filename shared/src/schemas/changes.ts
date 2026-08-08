import { z } from 'zod';
import { blobHashSchema, docIdSchema, PROTOCOL_LIMITS } from '../protocol.js';
import { base64Schema, byteSizeSchema, revSchema, seqSchema } from './common.js';

/** GET /v1/spaces/{id}/changes?since=&limit= — значения приходят строками из query. */
export const changesQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(PROTOCOL_LIMITS.changesMaxLimit)
    .default(PROTOCOL_LIMITS.changesDefaultLimit),
});
export type ChangesQuery = z.infer<typeof changesQuerySchema>;

/**
 * Одно изменение: только метаданные, без тела.
 * У надгробия metaCipher и blobHash пустые: DELETE идёт без тела запроса.
 */
export const changeItemSchema = z.object({
  docId: docIdSchema,
  rev: revSchema,
  seq: seqSchema,
  deleted: z.boolean(),
  metaCipher: base64Schema.nullable(),
  blobHash: blobHashSchema.nullable(),
  size: byteSizeSchema,
});
export type ChangeItem = z.infer<typeof changeItemSchema>;

/** seq — текущий счётчик пространства, догон закончен когда он равен seq последнего элемента. */
export const changesResponseSchema = z.object({
  seq: seqSchema,
  items: z.array(changeItemSchema),
});
export type ChangesResponse = z.infer<typeof changesResponseSchema>;
