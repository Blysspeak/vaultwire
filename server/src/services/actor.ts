import type { FastifyRequest } from 'fastify';
import { ProtocolError } from '#protocol-error';

/** Кто пишет. Пространство берётся из токена, а не из пути: путь уже сверен в requireRole. */
export type Actor = { spaceId: string; deviceId: string };

export function actorOf(request: FastifyRequest): Actor {
  const device = request.device;
  if (device === null) {
    throw new ProtocolError('unauthorized', 'устройство не определено');
  }
  return { spaceId: device.spaceId, deviceId: device.deviceId };
}
