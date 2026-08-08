import { z } from 'zod';
import { deviceIdSchema, spaceIdSchema } from '../protocol.js';
import { roleSchema } from '../roles.js';
import { base64Schema, deviceLabelSchema, epochSchema, timestampMsSchema } from './common.js';

/** Путь вида /v1/spaces/{id}/devices/{did}. */
export const deviceParamsSchema = z.object({
  id: spaceIdSchema,
  did: deviceIdSchema,
});
export type DeviceParams = z.infer<typeof deviceParamsSchema>;

/** POST /v1/spaces/{id}/devices — активация инвайта, единственный момент выдачи токена. */
export const joinSpaceRequestSchema = z.object({
  invite: z.string().min(1).max(256),
  label: deviceLabelSchema,
});
export type JoinSpaceRequest = z.infer<typeof joinSpaceRequestSchema>;

export const joinSpaceResponseSchema = z.object({
  deviceId: deviceIdSchema,
  deviceToken: z.string().min(1),
  salt: base64Schema,
  verifier: base64Schema,
  epoch: epochSchema,
  role: roleSchema,
});
export type JoinSpaceResponse = z.infer<typeof joinSpaceResponseSchema>;

/** Элемент списка участников, только для владельца. Токенов в выдаче нет. */
export const deviceSummarySchema = z.object({
  deviceId: deviceIdSchema,
  label: deviceLabelSchema,
  role: roleSchema,
  createdAt: timestampMsSchema,
  lastSeenAt: timestampMsSchema.nullable(),
  revokedAt: timestampMsSchema.nullable(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

/** GET /v1/spaces/{id}/devices. */
export const listDevicesResponseSchema = z.array(deviceSummarySchema);
export type ListDevicesResponse = z.infer<typeof listDevicesResponseSchema>;

/** POST /v1/spaces/{id}/devices/{did}/revoke. */
export const revokeDeviceResponseSchema = z.object({
  deviceId: deviceIdSchema,
  revokedAt: timestampMsSchema,
});
export type RevokeDeviceResponse = z.infer<typeof revokeDeviceResponseSchema>;
