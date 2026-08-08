import type { Prisma } from '@prisma/client';
import type { DocId } from '@vaultwire/shared';
import { ProtocolError } from '#protocol-error';

/** Одна запись документа. Тело уже лежит в блобах, здесь только ссылка на него. */
export type DocWriteOp = {
  docId: DocId;
  /**
   * null — документа быть не должно (If-None-Match: *);
   * число — ожидаемый rev (If-Match);
   * undefined — без условия, так приходит цель переезда.
   */
  expectedRev: number | null | undefined;
  deleted: boolean;
  metaCipher: string | null;
  blobHash: string | null;
};

export type DocWriteOk = { docId: DocId; rev: number; seq: number };

export type WriteContext = {
  spaceId: string;
  deviceId: string;
  /** Эпоха ключа пространства на момент записи, читается под блокировкой строки. */
  epoch: number;
  /** hash → размер тела. Размер документа сервер берёт отсюда, а не из тела запроса. */
  blobSizes: ReadonlyMap<string, number>;
};

type CurrentDoc = { rev: number; deleted: boolean } | null;

/** Ответ на рассинхрон обязан нести текущий rev, иначе клиенту нечем разрешить конфликт. */
function mismatch(message: string, current: CurrentDoc): ProtocolError {
  return new ProtocolError('revision_mismatch', message, {
    rev: current === null ? null : current.rev,
    deleted: current === null ? null : current.deleted,
  });
}

function checkPrecondition(op: DocWriteOp, current: CurrentDoc): void {
  if (op.expectedRev === undefined) return;

  if (op.expectedRev === null) {
    // Создание поверх надгробия разрешено: файл воскресает, rev продолжает расти.
    if (current !== null && !current.deleted) {
      throw mismatch('документ уже существует', current);
    }
    return;
  }

  if (current === null) {
    throw mismatch('документа нет, обновлять нечего', current);
  }
  if (current.rev !== op.expectedRev) {
    throw mismatch('ревизия устарела', current);
  }
}

/**
 * Применяет одну запись внутри уже открытой транзакции: upsert Doc и вставка DocRev.
 * Вызывается только из writeDocs: мимо неё писать документы нельзя.
 */
export async function applyDocWrite(
  tx: Prisma.TransactionClient,
  ctx: WriteContext,
  op: DocWriteOp,
  seq: bigint,
): Promise<DocWriteOk> {
  const current = await tx.doc.findUnique({
    where: { spaceId_docId: { spaceId: ctx.spaceId, docId: op.docId } },
    select: { rev: true, deleted: true },
  });

  checkPrecondition(op, current);

  const size = op.blobHash === null ? 0 : (ctx.blobSizes.get(op.blobHash) ?? null);
  if (size === null) {
    throw new ProtocolError('invalid_blob_hash', 'тело с таким хешем не загружено');
  }

  const rev = (current?.rev ?? 0) + 1;
  const row = {
    rev,
    seq,
    deleted: op.deleted,
    metaCipher: op.metaCipher,
    blobHash: op.blobHash,
    deviceId: ctx.deviceId,
  };

  await tx.doc.upsert({
    where: { spaceId_docId: { spaceId: ctx.spaceId, docId: op.docId } },
    create: { spaceId: ctx.spaceId, docId: op.docId, epoch: ctx.epoch, size, ...row },
    update: { epoch: ctx.epoch, size, ...row },
  });

  await tx.docRev.create({
    data: { spaceId: ctx.spaceId, docId: op.docId, ...row },
  });

  if (op.blobHash !== null) {
    // Счётчик считает ссылки ревизий: сборщик мусора сносит тело, когда их не осталось.
    await tx.blob.update({
      where: { spaceId_hash: { spaceId: ctx.spaceId, hash: op.blobHash } },
      data: { refCount: { increment: 1 } },
    });
  }

  return { docId: op.docId, rev, seq: Number(seq) };
}
