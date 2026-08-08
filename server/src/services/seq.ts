import type { Prisma } from '@prisma/client';
import type { DocId } from '@vaultwire/shared';
import { prisma } from '#db';
import { ProtocolError } from '#protocol-error';
import { applyDocWrite, type DocWriteOk, type DocWriteOp, type WriteContext } from '#services/doc-write';

// Батч из 50 документов это 150 запросов внутри одной транзакции, пяти секунд по умолчанию мало.
const TX_TIMEOUT_MS = 15_000;
const TX_MAX_WAIT_MS = 5_000;

/** shared — все записи под одним seq (переезд), per-op — каждая под своим. */
export type SeqMode = 'shared' | 'per-op';

export type WriteDocsParams = {
  spaceId: string;
  deviceId: string;
  ops: DocWriteOp[];
  seqMode: SeqMode;
  /** Батч отвечает по каждому документу отдельно, остальные вызовы падают целиком. */
  continueOnError?: boolean;
};

export type DocWriteFail = { docId: DocId; error: ProtocolError };
export type DocWriteOutcome = DocWriteOk | DocWriteFail;

export type WriteDocsResult = {
  /** Счётчик пространства после коммита. */
  spaceSeq: number;
  results: DocWriteOutcome[];
};

type SpaceRow = { seq: bigint; keyEpoch: number };

async function loadBlobSizes(
  tx: Prisma.TransactionClient,
  spaceId: string,
  ops: DocWriteOp[],
): Promise<Map<string, number>> {
  const hashes = [...new Set(ops.flatMap((op) => (op.blobHash === null ? [] : [op.blobHash])))];
  if (hashes.length === 0) return new Map();
  const rows = await tx.blob.findMany({
    where: { spaceId, hash: { in: hashes } },
    select: { hash: true, size: true },
  });
  return new Map(rows.map((row) => [row.hash, row.size]));
}

/**
 * Единственный путь записи документов.
 * Одна транзакция: блокировка строки пространства, инкремент seq, upsert Doc, вставка DocRev.
 * Блокировка сериализует записи внутри пространства и исключает дырки в нумерации,
 * из-за которых опрос changes молча пропускал бы изменения.
 */
export async function writeDocs(params: WriteDocsParams): Promise<WriteDocsResult> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<SpaceRow[]>`
        SELECT "seq", "keyEpoch" FROM "Space" WHERE "id" = ${params.spaceId} FOR UPDATE
      `;
      const space = locked[0];
      if (space === undefined) {
        throw new ProtocolError('not_found', 'пространство не найдено');
      }

      const ctx: WriteContext = {
        spaceId: params.spaceId,
        deviceId: params.deviceId,
        epoch: space.keyEpoch,
        blobSizes: await loadBlobSizes(tx, params.spaceId, params.ops),
      };

      // Переезд занимает один seq на обе записи: клиент не должен увидеть половину переименования.
      const shared = params.seqMode === 'shared' ? space.seq + 1n : null;
      let allocated = space.seq;
      const results: DocWriteOutcome[] = [];

      for (const op of params.ops) {
        const seq = shared ?? allocated + 1n;
        try {
          results.push(await applyDocWrite(tx, ctx, op, seq));
          allocated = seq;
        } catch (error) {
          // Продолжать разрешено только после нашей проверки: ошибка драйвера рушит транзакцию целиком.
          if (params.continueOnError !== true || !(error instanceof ProtocolError)) throw error;
          results.push({ docId: op.docId, error });
        }
      }

      if (allocated !== space.seq) {
        await tx.space.update({ where: { id: params.spaceId }, data: { seq: allocated } });
      }

      return { spaceSeq: Number(allocated), results };
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );
}

/** Для вызовов без continueOnError: отказ там уже вылетел исключением. */
export function expectOk(result: WriteDocsResult, index = 0): DocWriteOk {
  const outcome = result.results[index];
  if (outcome === undefined) throw new ProtocolError('internal', 'запись не вернула результат');
  if ('error' in outcome) throw outcome.error;
  return outcome;
}
