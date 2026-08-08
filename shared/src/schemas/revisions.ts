import { z } from 'zod';
import { blobHashSchema, deviceIdSchema } from '../protocol.js';
import { base64Schema, byteSizeSchema, revSchema, seqSchema, timestampMsSchema } from './common.js';

/** Элемент истории документа. Восстановление создаёт новую ревизию, история не переписывается. */
export const revisionItemSchema = z.object({
  rev: revSchema,
  seq: seqSchema,
  deleted: z.boolean(),
  metaCipher: base64Schema.nullable(),
  blobHash: blobHashSchema.nullable(),
  size: byteSizeSchema,
  deviceId: deviceIdSchema,
  createdAt: timestampMsSchema,
});
export type RevisionItem = z.infer<typeof revisionItemSchema>;

/** GET /v1/spaces/{id}/docs/{docId}/revisions, от свежей к старой. */
export const listRevisionsResponseSchema = z.array(revisionItemSchema);
export type ListRevisionsResponse = z.infer<typeof listRevisionsResponseSchema>;
