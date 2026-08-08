import type { FastifyPluginAsync } from 'fastify';
import {
  deviceParamsSchema,
  joinSpaceRequestSchema,
  spaceParamsSchema,
  type JoinSpaceResponse,
  type ListDevicesResponse,
  type RevokeDeviceResponse,
} from '@vaultwire/shared';
import { inviteActivationLimit } from '#plugins/limits';
import { parseOrFail } from '#routes/validate';
import { joinSpace, listDevices, revokeDevice } from '#services/devices';
import { hub } from '#services/hub';

/**
 * POST /spaces/:id/devices (активация инвайта), GET /spaces/:id/devices,
 * POST /spaces/:id/devices/:did/revoke. Пути без /v1: префикс задан в app.ts.
 */

const JSON_BODY_LIMIT = 128 * 1024;

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/spaces/:id/devices',
    { bodyLimit: JSON_BODY_LIMIT, config: { rateLimit: inviteActivationLimit } },
    async (request, reply) => {
      const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
      const body = parseOrFail(joinSpaceRequestSchema, request.body, 'тело активации инвайта');
      // Токен устройства виден только в этом ответе.
      const joined: JoinSpaceResponse = await joinSpace({ ...body, spaceId: params.id });
      return reply.status(201).send(joined);
    },
  );

  app.get('/spaces/:id/devices', { preHandler: app.requireRole('owner') }, async (request) => {
    const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
    const response: ListDevicesResponse = await listDevices(params.id);
    return response;
  });

  app.post(
    '/spaces/:id/devices/:did/revoke',
    { preHandler: app.requireRole('owner') },
    async (request) => {
      const params = parseOrFail(deviceParamsSchema, request.params, 'путь');
      const response: RevokeDeviceResponse = await revokeDevice(params.id, params.did);
      // Кэш проверенных токенов чистится немедленно, иначе отозванный работал бы ещё минуту.
      app.forgetDevice(params.did);
      // Живое соединение переживает отзыв: закрываем его, а не ждём heartbeat.
      hub.dropDevice(params.did);
      return response;
    },
  );
};
