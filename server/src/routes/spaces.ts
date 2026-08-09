import type { FastifyPluginAsync } from 'fastify';
import {
  createSpaceRequestSchema,
  spaceParamsSchema,
  type CreateSpaceResponse,
  type DeleteSpaceResponse,
  type GetSpaceResponse,
} from '@vaultwire/shared';
import { config } from '#config';
import { ProtocolError } from '#protocol-error';
import { parseOrFail } from '#routes/validate';
import { createSpace, deleteSpace, getSpaceOverview, setVerifier } from '#services/spaces';
import { secretsEqual } from '#services/tokens';

/**
 * POST /spaces (bootstrap-токен), GET /spaces/:id, PATCH /spaces/:id.
 * Пути внутри модуля пишутся без /v1: префикс задан при регистрации в app.ts.
 */

/** Тела здесь маленькие, общий лимит приложения рассчитан на заливку блоба. */
const JSON_BODY_LIMIT = 128 * 1024;

/**
 * Соль и верификатор считает клиент, но верификатор зависит от spaceId, который
 * выдаёт сервер, поэтому при создании оба поля необязательны: соли сервер сделает
 * свою, верификатор доедет отдельным PATCH.
 */
const createBodySchema = createSpaceRequestSchema.partial({ salt: true, verifier: true });
const patchBodySchema = createSpaceRequestSchema.pick({ verifier: true });

function bearerFrom(header: string | undefined): string | null {
  if (header === undefined) return null;
  return /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null;
}

function assertBootstrap(header: string | undefined): void {
  const expected = config.bootstrapToken;
  if (expected === null) throw new ProtocolError('forbidden', 'создание пространств отключено');
  const token = bearerFrom(header);
  if (token === null || !secretsEqual(token, expected)) {
    throw new ProtocolError('unauthorized', 'нужен корректный bootstrap-токен');
  }
}

export const spacesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/spaces', { bodyLimit: JSON_BODY_LIMIT }, async (request, reply) => {
    assertBootstrap(request.headers.authorization);
    const body = parseOrFail(createBodySchema, request.body, 'тело создания пространства');
    const created: CreateSpaceResponse = await createSpace(body);
    // Токен владельца показывается ровно здесь, в базе только его хеш.
    return reply.status(201).send(created);
  });

  app.get('/spaces/:id', { preHandler: app.requireRole('ro') }, async (request) => {
    const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
    const device = request.device;
    if (device === null) throw new ProtocolError('unauthorized', 'устройство не определено');
    const response: GetSpaceResponse = await getSpaceOverview(params.id, device.role);
    return response;
  });

  app.delete('/spaces/:id', { preHandler: app.requireRole('owner') }, async (request) => {
    const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
    const response: DeleteSpaceResponse = await deleteSpace(params.id);
    return response;
  });

  app.patch(
    '/spaces/:id',
    { preHandler: app.requireRole('owner'), bodyLimit: JSON_BODY_LIMIT },
    async (request) => {
      const params = parseOrFail(spaceParamsSchema, request.params, 'путь');
      const body = parseOrFail(patchBodySchema, request.body, 'тело установки верификатора');
      await setVerifier(params.id, body.verifier);
      const response: GetSpaceResponse = await getSpaceOverview(params.id, 'owner');
      return response;
    },
  );
};
