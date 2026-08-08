import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { canAdmin, canWrite, type DeviceId, type Role } from '@vaultwire/shared';
import { ProtocolError } from '#protocol-error';
import { hashToken, TokenCache, type AuthenticatedDevice } from '#plugins/token-cache';
import { lookupDeviceByHash } from '#services/device-auth';

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: проверяет Bearer и кладёт устройство в request.device. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /** preHandler-фабрика: аутентификация плюс требование минимальной роли. */
    requireRole: (minimum: Role) => (request: FastifyRequest) => Promise<void>;
    /** Немедленный сброс кэша при отзыве устройства. */
    forgetDevice: (deviceId: DeviceId) => void;
  }
  interface FastifyRequest {
    device: AuthenticatedDevice | null;
  }
}

const spaceScopeSchema = z.object({ id: z.string() });

function bearerFrom(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** owner > rw > ro. Порядок задан хелперами shared, чтобы не расходиться с клиентом. */
function hasRole(role: Role, minimum: Role): boolean {
  if (minimum === 'owner') return canAdmin(role);
  if (minimum === 'rw') return canWrite(role);
  return true;
}

export function registerAuth(app: FastifyInstance): void {
  const cache = new TokenCache();

  app.decorateRequest('device', null);

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      throw new ProtocolError('unauthorized', 'нужен заголовок Authorization: Bearer');
    }

    const tokenHash = hashToken(token);
    const cached = cache.get(tokenHash);
    if (cached !== null) {
      request.device = cached;
      return;
    }

    const device: AuthenticatedDevice = await lookupDeviceByHash(tokenHash);
    cache.set(tokenHash, device);
    request.device = device;
  };

  const requireRole =
    (minimum: Role) =>
    async (request: FastifyRequest): Promise<void> => {
      if (request.device === null) await authenticate(request);
      const device = request.device;
      if (device === null) {
        throw new ProtocolError('unauthorized', 'устройство не определено');
      }

      const scope = spaceScopeSchema.safeParse(request.params);
      if (scope.success && scope.data.id !== (device.spaceId as string)) {
        throw new ProtocolError('forbidden', 'токен выдан другому пространству');
      }
      if (!hasRole(device.role, minimum)) {
        throw new ProtocolError('forbidden', 'роль не позволяет эту операцию');
      }
    };

  app.decorate('authenticate', authenticate);
  app.decorate('requireRole', requireRole);
  app.decorate('forgetDevice', (deviceId: DeviceId) => {
    cache.forgetDevice(deviceId);
  });
}
