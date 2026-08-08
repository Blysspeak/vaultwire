import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashToken } from '#plugins/token-cache';
import { ProtocolError } from '#protocol-error';

/**
 * Общий лимит считается по устройству: за одним адресом сидит вся команда,
 * и лимит по IP резал бы соседей. Ключ — хеш заголовка, сам токен в память не кладём.
 */
const DEVICE_LIMIT_MAX = 600;
const DEVICE_LIMIT_WINDOW_MS = 60_000;

/**
 * Активация инвайта единственная точка без токена, поэтому лимит по адресу
 * жёсткий и отдельный от общего: он ограничивает подбор кодов.
 */
const INVITE_LIMIT_MAX = 10;
const INVITE_LIMIT_WINDOW_MS = 60_000;

/**
 * Плагин бросает то, что вернул билдер: отдавать надо саму ошибку, а не её тело,
 * иначе обработчик приложения не узнает её и ответит 500 вместо 429.
 */
function rateLimitError(message: string): () => ProtocolError {
  return () => new ProtocolError('rate_limited', message);
}

export async function registerRateLimits(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: DEVICE_LIMIT_MAX,
    timeWindow: DEVICE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => {
      const header = request.headers.authorization;
      return header === undefined ? request.ip : `device:${hashToken(header)}`;
    },
    errorResponseBuilder: rateLimitError('слишком много запросов'),
  });
}

/** Ставится в config роута активации инвайта поверх общего лимита. */
export const inviteActivationLimit = {
  max: INVITE_LIMIT_MAX,
  timeWindow: INVITE_LIMIT_WINDOW_MS,
  keyGenerator: (request: FastifyRequest): string => request.ip,
  errorResponseBuilder: rateLimitError('слишком много попыток активации инвайта'),
} as const;
