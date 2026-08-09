import { z } from 'zod';
import { spaceIdSchema } from '../protocol.js';
import { roleSchema } from '../roles.js';
import { base64Schema, byteSizeSchema, deviceLabelSchema, epochSchema, seqSchema } from './common.js';

/** Путь вида /v1/spaces/{id}. */
export const spaceParamsSchema = z.object({ id: spaceIdSchema });
export type SpaceParams = z.infer<typeof spaceParamsSchema>;

/**
 * POST /v1/spaces, bootstrap-токен.
 * Соль и верификатор считает клиент: сервер не знает пароля и не может их получить.
 */
export const createSpaceRequestSchema = z.object({
  salt: base64Schema,
  verifier: base64Schema,
  deviceLabel: deviceLabelSchema,
});
export type CreateSpaceRequest = z.infer<typeof createSpaceRequestSchema>;

export const createSpaceResponseSchema = z.object({
  spaceId: spaceIdSchema,
  ownerToken: z.string().min(1),
  salt: base64Schema,
});
export type CreateSpaceResponse = z.infer<typeof createSpaceResponseSchema>;

/** GET /v1/spaces/{id}. */
export const getSpaceResponseSchema = z.object({
  seq: seqSchema,
  role: roleSchema,
  docCount: z.number().int().nonnegative(),
  bytes: byteSizeSchema,
  epoch: epochSchema,
  salt: base64Schema,
  // null между созданием пространства и установкой верификатора: он зависит от
  // spaceId, который выдаёт сервер, поэтому доезжает отдельным PATCH.
  verifier: base64Schema.nullable(),
  retentionDays: z.number().int().positive(),
});
export type GetSpaceResponse = z.infer<typeof getSpaceResponseSchema>;

/**
 * DELETE /v1/spaces/{id}, только владелец.
 * Пространство сносится целиком: документы, ревизии, устройства и инвайты уходят
 * каскадом, тела остаются сиротами и достаются сборщику мусора. Подтверждение
 * идентификатором требует клиент: сервер лишь исполняет.
 */
export const deleteSpaceResponseSchema = z.object({
  spaceId: spaceIdSchema,
  removedDocs: z.number().int().nonnegative(),
  removedDevices: z.number().int().nonnegative(),
});
export type DeleteSpaceResponse = z.infer<typeof deleteSpaceResponseSchema>;
