import { ulid } from 'ulid';
import {
  deviceIdSchema,
  roleSchema,
  type DeviceSummary,
  type JoinSpaceRequest,
  type JoinSpaceResponse,
  type RevokeDeviceResponse,
} from '@vaultwire/shared';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';
import { claimInvite } from '#services/invites';
import { generateDeviceToken, hashSecret } from '#services/tokens';

export type JoinSpaceInput = JoinSpaceRequest & { spaceId: string };

/** Активация инвайта: расход использования и создание устройства одной транзакцией. */
export async function joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResponse> {
  const deviceId = ulid();
  const deviceToken = generateDeviceToken();

  return prisma.$transaction(async (tx) => {
    const role = await claimInvite(tx, input.spaceId, input.invite);

    const space = await tx.space.findUnique({
      where: { id: input.spaceId },
      select: { salt: true, verifier: true, keyEpoch: true },
    });
    if (space === null) throw new ProtocolError('not_found', 'пространство не найдено');
    // Без верификатора участник не может проверить пароль и зальёт нечитаемые файлы.
    if (space.verifier.length === 0) {
      throw new ProtocolError('forbidden', 'владелец ещё не задал верификатор пароля');
    }

    await tx.device.create({
      data: {
        id: deviceId,
        spaceId: input.spaceId,
        tokenHash: hashSecret(deviceToken),
        role,
        label: input.label,
      },
    });

    return {
      deviceId: deviceIdSchema.parse(deviceId),
      deviceToken,
      salt: space.salt,
      verifier: space.verifier,
      epoch: space.keyEpoch,
      role,
    };
  });
}

export async function listDevices(spaceId: string): Promise<DeviceSummary[]> {
  const rows = await prisma.device.findMany({
    where: { spaceId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      label: true,
      role: true,
      createdAt: true,
      lastSeenAt: true,
      revokedAt: true,
    },
  });

  return rows.map((row) => ({
    deviceId: deviceIdSchema.parse(row.id),
    label: row.label,
    // Роль в базе строкой, источник истины roleSchema; битую строку не прячем.
    role: parseRole(row.role),
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt?.getTime() ?? null,
    revokedAt: row.revokedAt?.getTime() ?? null,
  }));
}

/** Отзыв идемпотентен: повторный вызов возвращает тот же момент времени. */
export async function revokeDevice(spaceId: string, deviceId: string): Promise<RevokeDeviceResponse> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, spaceId },
    select: { role: true, revokedAt: true },
  });
  if (device === null) throw new ProtocolError('not_found', 'устройство не найдено');

  if (device.revokedAt !== null) {
    return { deviceId: deviceIdSchema.parse(deviceId), revokedAt: device.revokedAt.getTime() };
  }

  if (device.role === 'owner') {
    const owners = await prisma.device.count({ where: { spaceId, role: 'owner', revokedAt: null } });
    // Отзыв последнего владельца оставил бы пространство без управления навсегда.
    if (owners <= 1) throw new ProtocolError('forbidden', 'нельзя отозвать единственного владельца');
  }

  const revokedAt = new Date();
  await prisma.device.update({ where: { id: deviceId }, data: { revokedAt } });
  return { deviceId: deviceIdSchema.parse(deviceId), revokedAt: revokedAt.getTime() };
}

function parseRole(value: string): DeviceSummary['role'] {
  const role = roleSchema.safeParse(value);
  if (!role.success) throw new ProtocolError('internal', 'у устройства некорректная роль');
  return role.data;
}
