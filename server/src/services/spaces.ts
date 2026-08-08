import { ulid } from 'ulid';
import {
  spaceIdSchema,
  type CreateSpaceResponse,
  type GetSpaceResponse,
  type Role,
} from '@vaultwire/shared';
import { config } from '#config';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';
import { generateDeviceToken, generateSaltBase64, hashSecret } from '#services/tokens';

export type CreateSpaceInput = {
  /** Соль клиента. Не задана — сервер генерирует свою, 32 байта. */
  salt?: string | undefined;
  /** Верификатор зависит от spaceId, поэтому обычно приходит позже, через PATCH. */
  verifier?: string | undefined;
  deviceLabel: string;
};

/** Пространство и его владелец создаются одной транзакцией: без владельца оно бесполезно. */
export async function createSpace(input: CreateSpaceInput): Promise<CreateSpaceResponse> {
  const spaceId = ulid();
  const salt = input.salt ?? generateSaltBase64();
  const ownerToken = generateDeviceToken();

  await prisma.$transaction([
    prisma.space.create({
      data: {
        id: spaceId,
        salt,
        verifier: input.verifier ?? '',
        quotaBytes: BigInt(config.defaultQuotaBytes),
      },
    }),
    prisma.device.create({
      data: {
        id: ulid(),
        spaceId,
        tokenHash: hashSecret(ownerToken),
        role: 'owner',
        label: input.deviceLabel,
      },
    }),
  ]);

  return { spaceId: spaceIdSchema.parse(spaceId), ownerToken, salt };
}

/** Сводка пространства. Роль берётся у вызывающего, в самом пространстве её нет. */
export async function getSpaceOverview(spaceId: string, role: Role): Promise<GetSpaceResponse> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      seq: true,
      salt: true,
      verifier: true,
      keyEpoch: true,
      retentionDays: true,
      usedBytes: true,
    },
  });
  if (space === null) throw new ProtocolError('not_found', 'пространство не найдено');

  const docCount = await prisma.doc.count({ where: { spaceId, deleted: false } });

  return {
    seq: Number(space.seq),
    role,
    docCount,
    bytes: Number(space.usedBytes),
    epoch: space.keyEpoch,
    salt: space.salt,
    // В базе верификатор до установки пустая строка, наружу это null по схеме.
    verifier: space.verifier === '' ? null : space.verifier,
    retentionDays: space.retentionDays,
  };
}

/**
 * Верификатор ставится один раз. Замена на новый сделала бы нечитаемыми все
 * уже залитые документы, поэтому повторная установка запрещена.
 */
export async function setVerifier(spaceId: string, verifier: string): Promise<void> {
  const updated = await prisma.space.updateMany({
    where: { id: spaceId, verifier: '' },
    data: { verifier },
  });
  if (updated.count === 0) {
    throw new ProtocolError('forbidden', 'верификатор уже установлен и не подлежит замене');
  }
}
