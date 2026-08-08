import { z } from 'zod';

/** Коды ошибок протокола. Транспортный статус вторичен, разбор идёт по коду. */
export const PROTOCOL_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'revision_mismatch',
  'too_large',
  'rate_limited',
  'quota_exceeded',
  'invalid_blob_hash',
  'not_found',
  // Тело не прошло схему и внутренний сбой: клиент на них не ветвится, но обязан
  // разобрать тело ответа, иначе 400 и 500 превращаются в «негодный ответ».
  'bad_request',
  'internal',
] as const;

export const protocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODES);
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;

export const protocolErrorBodySchema = z.object({
  code: protocolErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ProtocolErrorBody = z.infer<typeof protocolErrorBodySchema>;

/** Соответствие кода и статуса HTTP из таблицы раздела 3 спецификации. */
export const PROTOCOL_ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  revision_mismatch: 409,
  too_large: 413,
  rate_limited: 429,
  quota_exceeded: 507,
  invalid_blob_hash: 400,
  not_found: 404,
  bad_request: 400,
  internal: 500,
} as const satisfies Record<ProtocolErrorCode, number>;

export type ProtocolErrorStatus = (typeof PROTOCOL_ERROR_STATUS)[ProtocolErrorCode];
