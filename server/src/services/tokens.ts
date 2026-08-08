import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PROTOCOL_LIMITS } from '@vaultwire/shared';
import { hashToken } from '#plugins/token-cache';

/**
 * Алгоритм хеширования секретов один на весь сервер: тот же, что на горячем
 * пути аутентификации. Здесь только имя предметной области.
 */
export const hashSecret = hashToken;

/** Токен устройства, 32 случайных байта. Показывается ровно один раз. */
const DEVICE_TOKEN_BYTES = 32;

/** Код инвайта: попадает внутрь vw1:<base64url> целиком, поэтому короче токена. */
const INVITE_CODE_BYTES = 24;

function randomUrlSafe(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateDeviceToken(): string {
  return randomUrlSafe(DEVICE_TOKEN_BYTES);
}

export function generateInviteCode(): string {
  return randomUrlSafe(INVITE_CODE_BYTES);
}

/** Соль пространства: открытое поле, но обязана быть криптостойкой. */
export function generateSaltBase64(): string {
  return randomBytes(PROTOCOL_LIMITS.saltBytes).toString('base64');
}

/**
 * Сравнение секретов в постоянном времени. Сравниваются дайджесты, а не сами
 * строки: так длина секрета не утекает через длину буфера.
 */
export function secretsEqual(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(hashSecret(left), 'hex'), Buffer.from(hashSecret(right), 'hex'));
}
