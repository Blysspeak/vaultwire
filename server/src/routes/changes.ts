import type { FastifyPluginAsync } from 'fastify';
import { changesQuerySchema } from '@vaultwire/shared';
import { parseOrFail } from '#routes/validate';
import { actorOf } from '#services/actor';
import { listChanges } from '#services/changes';

/**
 * GET /spaces/:id/changes?since=&limit= — метаданные без тел,
 * запрос ложится на индекс (spaceId, seq).
 * Границы limit заданы в changesQuerySchema из shared, чтобы клиент и сервер не разошлись.
 * Пути без /v1: префикс задан при регистрации в app.ts.
 */
export const changesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/spaces/:id/changes', { preHandler: app.requireRole('ro') }, async (request) => {
    const query = parseOrFail(changesQuerySchema, request.query, 'параметры запроса изменений');
    return listChanges(actorOf(request).spaceId, query.since, query.limit);
  });
};
