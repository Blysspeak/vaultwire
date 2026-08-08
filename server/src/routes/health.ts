import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { PROTOCOL_VERSION } from '@vaultwire/shared';
import { prisma } from '#db';
import { hub } from '#services/hub';

/**
 * GET /health — проверка живости для пайплайна выкладки и мониторинга.
 * Регистрируется без префикса /v1: это не часть протокола, а служебный эндпоинт,
 * и типа в shared у него нет намеренно.
 * Токена не требует: наружу порт не смотрит, ходят только nginx и раннер по localhost.
 */
interface HealthResponse {
  status: 'ok' | 'degraded';
  protocolVersion: number;
  database: 'up' | 'down';
  /** Живые WebSocket-соединения всех пространств этого процесса. */
  wsConnections: number;
  uptimeSeconds: number;
}

/** Проверка не должна висеть дольше, чем ждёт curl в шаге выкладки. */
const DB_PROBE_TIMEOUT_MS = 2_000;

async function probeDatabase(log: FastifyBaseLogger): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const guard = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('таймаут проверки базы'));
      }, DB_PROBE_TIMEOUT_MS);
    });
    // Запрос без таблиц: проверяем живость пула, а не схему.
    await Promise.race([prisma.$queryRaw`SELECT 1`, guard]);
    return true;
  } catch (error) {
    log.warn({ err: error }, 'проверка живости: база недоступна');
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Лимит запросов снят: иначе мониторинг съедает бюджет адреса, общий с живыми клиентами.
  app.get('/health', { config: { rateLimit: false } }, async (request, reply) => {
    const databaseUp = await probeDatabase(request.log);
    const body: HealthResponse = {
      status: databaseUp ? 'ok' : 'degraded',
      protocolVersion: PROTOCOL_VERSION,
      database: databaseUp ? 'up' : 'down',
      wsConnections: hub.size,
      uptimeSeconds: Math.round(process.uptime()),
    };
    // 503 без базы обязателен: шаг выкладки ходит curl -sf и должен откатиться сам.
    return reply.status(databaseUp ? 200 : 503).send(body);
  });
};
