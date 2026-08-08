import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import { roleSchema, type CreateInviteRequest, type CreateInviteResponse, type Role } from '@vaultwire/shared';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';
import { generateInviteCode, hashSecret } from '#services/tokens';

/** Верхние границы срока и числа активаций: бессрочный инвайт это утечка доступа. */
const MAX_EXPIRES_IN_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_USES = 100;

export type CreateInviteInput = CreateInviteRequest & {
  spaceId: string;
  createdBy: string;
};

export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
  if (input.expiresIn > MAX_EXPIRES_IN_MS) {
    throw new ProtocolError('bad_request', 'срок жизни инвайта больше 90 дней');
  }
  if (input.maxUses > MAX_USES) {
    throw new ProtocolError('bad_request', `лимит активаций больше ${MAX_USES}`);
  }

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + input.expiresIn);

  // В базе только хеш: код виден один раз, в этом ответе.
  await prisma.invite.create({
    data: {
      id: ulid(),
      spaceId: input.spaceId,
      codeHash: hashSecret(code),
      role: input.role,
      expiresAt,
      maxUses: input.maxUses,
      createdBy: input.createdBy,
    },
  });

  return { code, expiresAt: expiresAt.getTime() };
}

/**
 * Расход одной активации внутри транзакции присоединения.
 * Счётчик инкрементируется условным updateMany: параллельные активации не могут
 * вдвоём пройти последнее свободное использование.
 */
export async function claimInvite(
  tx: Prisma.TransactionClient,
  spaceId: string,
  code: string,
): Promise<Role> {
  const now = new Date();
  const invite = await tx.invite.findUnique({
    where: { codeHash: hashSecret(code) },
    select: { id: true, spaceId: true, role: true, expiresAt: true, maxUses: true },
  });

  // Причину не уточняем: иначе перебор кодов различал бы чужой инвайт и несуществующий.
  if (invite === null || invite.spaceId !== spaceId) {
    throw new ProtocolError('unauthorized', 'инвайт неизвестен или недействителен');
  }
  if (invite.expiresAt <= now) {
    throw new ProtocolError('unauthorized', 'срок действия инвайта истёк');
  }

  const claimed = await tx.invite.updateMany({
    where: { id: invite.id, usedCount: { lt: invite.maxUses }, expiresAt: { gt: now } },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new ProtocolError('unauthorized', 'лимит активаций инвайта исчерпан');
  }

  const role = roleSchema.safeParse(invite.role);
  if (!role.success) {
    throw new ProtocolError('internal', 'у инвайта некорректная роль');
  }
  return role.data;
}
