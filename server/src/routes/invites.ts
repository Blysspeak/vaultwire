import type { FastifyPluginAsync } from 'fastify';
import {
  createInviteRequestSchema,
  spaceParamsSchema,
  type CreateInviteResponse,
} from '@vaultwire/shared';
import { ProtocolError } from '#protocol-error';
import { parseOrFail } from '#routes/validate';
import { createInvite } from '#services/invites';

/**
 * POST /spaces/:id/invites, только владелец. Код инвайта хранится хешем SHA-256.
 * Пути без /v1: префикс задан при регистрации в app.ts.
 */

const JSON_BODY_LIMIT = 16 * 1024;

export const invitesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/spaces/:id/invites',
    { preHandler: app.requireRole('owner'), bodyLimit: JSON_BODY_LIMIT },
    async (request, reply) => {
      const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
      const body = parseOrFail(createInviteRequestSchema, request.body, 'тело выпуска инвайта');
      const device = request.device;
      if (device === null) throw new ProtocolError('unauthorized', 'устройство не определено');

      const created: CreateInviteResponse = await createInvite({
        ...body,
        spaceId: params.id,
        createdBy: device.deviceId,
      });
      // Код виден только здесь: в базе лежит его хеш.
      return reply.status(201).send(created);
    },
  );
};
