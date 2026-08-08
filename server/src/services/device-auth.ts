import { deviceIdSchema, roleSchema, spaceIdSchema } from '@vaultwire/shared';
import { prisma } from '#db';
import { logger } from '#logger';
import type { AuthenticatedDevice } from '#plugins/token-cache';
import { ProtocolError } from '#protocol-error';

/**
 * Единственный запрос к базе за устройством по хешу токена: им пользуются
 * и HTTP-аутентификация (при промахе кэша), и авторизация WebSocket первым фреймом.
 */
export async function lookupDeviceByHash(tokenHash: string): Promise<AuthenticatedDevice> {
  const row = await prisma.device.findUnique({
    where: { tokenHash },
    select: { id: true, spaceId: true, role: true, revokedAt: true },
  });
  if (row === null || row.revokedAt !== null) {
    throw new ProtocolError('unauthorized', 'токен неизвестен или отозван');
  }

  const role = roleSchema.safeParse(row.role);
  if (!role.success) {
    throw new ProtocolError('unauthorized', 'у устройства некорректная роль');
  }

  touchLastSeen(row.id);

  return {
    deviceId: deviceIdSchema.parse(row.id),
    spaceId: spaceIdSchema.parse(row.spaceId),
    role: role.data,
  };
}

/**
 * Отметка присутствия не влияет на ответ, поэтому идёт мимо ожидания.
 * Сюда попадают только промахи кэша, то есть не чаще раза в минуту на устройство.
 */
function touchLastSeen(deviceId: string): void {
  prisma.device
    .update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } })
    .catch((error: unknown) => {
      logger.warn({ err: error, deviceId }, 'не удалось обновить lastSeenAt');
    });
}
