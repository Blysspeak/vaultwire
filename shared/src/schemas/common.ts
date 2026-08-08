import { z } from 'zod';

/** Шифроблоб или соль в base64 со стандартным алфавитом и паддингом. */
export const base64Schema = z
  .string()
  .min(1)
  .max(65_536)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'ожидается base64');
export type Base64 = z.infer<typeof base64Schema>;

/** Номер ревизии документа, растёт с единицы внутри документа. */
export const revSchema = z.number().int().positive();
export type Rev = z.infer<typeof revSchema>;

/** Монотонный счётчик изменений пространства. */
export const seqSchema = z.number().int().nonnegative();
export type Seq = z.infer<typeof seqSchema>;

/** Размер в байтах. */
export const byteSizeSchema = z.number().int().nonnegative();
export type ByteSize = z.infer<typeof byteSizeSchema>;

/** Момент времени, миллисекунды Unix. */
export const timestampMsSchema = z.number().int().nonnegative();
export type TimestampMs = z.infer<typeof timestampMsSchema>;

/** Интервал, миллисекунды. */
export const durationMsSchema = z.number().int().positive();
export type DurationMs = z.infer<typeof durationMsSchema>;

/** Эпоха ключа пространства, участвует в выводе ключей. */
export const epochSchema = z.number().int().nonnegative();
export type Epoch = z.infer<typeof epochSchema>;

/** Человекочитаемая метка устройства, видна владельцу в списке участников. */
export const deviceLabelSchema = z.string().min(1).max(64);
export type DeviceLabel = z.infer<typeof deviceLabelSchema>;

/** Условная запись: If-Match с rev для обновления, If-None-Match со звёздочкой для создания. */
export const conditionalWriteHeadersSchema = z.object({
  'if-match': z.string().min(1).optional(),
  'if-none-match': z.literal('*').optional(),
});
export type ConditionalWriteHeaders = z.infer<typeof conditionalWriteHeadersSchema>;
