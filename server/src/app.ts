import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { config } from '#config';
import { logger } from '#logger';
import { registerAuth } from '#plugins/auth';
import { registerRateLimits } from '#plugins/limits';
import { normalizeError, ProtocolError } from '#protocol-error';
import { blobsRoutes } from '#routes/blobs';
import { changesRoutes } from '#routes/changes';
import { devicesRoutes } from '#routes/devices';
import { docsRoutes } from '#routes/docs';
import { healthRoutes } from '#routes/health';
import { invitesRoutes } from '#routes/invites';
import { spacesRoutes } from '#routes/spaces';
import { syncWsRoutes } from '#routes/sync-ws';

/** Фреймы WebSocket маленькие, большой payload там означает только злоупотребление. */
const WS_MAX_PAYLOAD_BYTES = 4_096;

export async function buildApp(): Promise<FastifyInstance> {
  // Аннотация обязательна: иначе Fastify выведет конкретный тип pino-логгера,
  // и FastifyInstance перестанет совпадать с базовым во всех остальных модулях.
  const loggerInstance: FastifyBaseLogger = logger;

  const app = Fastify({
    loggerInstance,
    // nginx стоит впереди, иначе request.ip у всех одинаковый
    trustProxy: true,
    // верхняя граница относится к заливке тела блоба, JSON-роуты ставят свой лимит
    bodyLimit: config.maxBlobBytes,
    genReqId: () => ulid(),
  });

  // DELETE уходит без тела, но клиентский слой всё равно проставляет заголовок
  // application/json, и стандартный парсер Fastify отвечает на такое 415. Пустое
  // тело здесь законно: удаление документа несёт всё нужное в пути и If-Match.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : '';
    if (raw.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(new ProtocolError('bad_request', 'тело не является корректным JSON'), undefined);
    }
  });

  registerAuth(app);

  await registerRateLimits(app);

  await app.register(websocket, { options: { maxPayload: WS_MAX_PAYLOAD_BYTES } });

  // Любая ошибка уходит наружу одним телом ProtocolErrorBody.
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    if (normalized.status >= 500) {
      request.log.error({ err: error }, 'внутренняя ошибка запроса');
    } else {
      request.log.warn({ err: error, code: normalized.code }, 'запрос отклонён');
    }
    return reply.status(normalized.status).send(normalized.toBody());
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(new ProtocolError('not_found', 'маршрут не найден').toBody()),
  );

  // Проверка живости вне /v1: она не часть протокола и переживёт смену его версии.
  await app.register(healthRoutes);

  // HTTP-часть протокола целиком живёт под /v1.
  await app.register(
    async (scope) => {
      await scope.register(spacesRoutes);
      await scope.register(devicesRoutes);
      await scope.register(invitesRoutes);
      await scope.register(docsRoutes);
      await scope.register(blobsRoutes);
      await scope.register(changesRoutes);
    },
    { prefix: '/v1' },
  );

  // WebSocket регистрируется без префикса: его путь задан константой WS_PATH.
  await app.register(syncWsRoutes);

  return app;
}
