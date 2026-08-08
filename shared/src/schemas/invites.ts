import { z } from 'zod';
import { spaceIdSchema } from '../protocol.js';
import { roleSchema } from '../roles.js';
import { durationMsSchema, timestampMsSchema } from './common.js';

/** POST /v1/spaces/{id}/invites, только владелец. */
export const createInviteRequestSchema = z.object({
  role: roleSchema,
  /** Срок жизни инвайта, миллисекунды. */
  expiresIn: durationMsSchema,
  maxUses: z.number().int().positive(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

/** Сервер хранит только хеш кода, поэтому код виден один раз, в этом ответе. */
export const createInviteResponseSchema = z.object({
  code: z.string().min(1).max(256),
  expiresAt: timestampMsSchema,
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

/** Содержимое кода подключения vw1:<base64url> — что владелец передаёт участнику. */
export const connectionCodePayloadSchema = z.object({
  /** URL сервера. */
  u: z.string().url(),
  s: spaceIdSchema,
  i: z.string().min(1).max(256),
});
export type ConnectionCodePayload = z.infer<typeof connectionCodePayloadSchema>;

/** Префикс кода подключения, отделяет версию формата от полезной нагрузки. */
export const CONNECTION_CODE_PREFIX = 'vw1:';

export const connectionCodeSchema = z
  .string()
  .regex(/^vw1:[A-Za-z0-9_-]+$/, 'ожидается код вида vw1:<base64url>');
export type ConnectionCode = z.infer<typeof connectionCodeSchema>;
