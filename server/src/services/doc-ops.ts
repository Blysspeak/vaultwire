import type {
  BatchDocItem,
  BatchDocResult,
  DocId,
  DocWriteResult,
  MoveDocRequest,
  PutDocRequest,
} from '@vaultwire/shared';
import type { Actor } from '#services/actor';
import type { DocWriteOp } from '#services/doc-write';
import { hub } from '#services/hub';
import { expectOk, writeDocs, type WriteDocsResult } from '#services/seq';

/**
 * Звоночек остальным устройствам пространства. Зовётся только здесь, после
 * возврата из writeDocs: транзакция уже закоммичена, и пришедший за данными
 * увидит новое состояние. Внутри транзакции фрейм ушёл бы раньше коммита.
 */
function announce(actor: Actor, result: WriteDocsResult): void {
  // Батч мог отказать целиком: тогда seq пространства не двинулся и звонить не о чем.
  if (!result.results.some((outcome) => !('error' in outcome))) return;
  hub.broadcastChanged(actor.spaceId, result.spaceSeq, actor.deviceId);
}

/** Надгробие: метаданных и тела у него нет, старые ревизии живут срок хранения. */
function tombstone(docId: DocId, expectedRev: number | null | undefined): DocWriteOp {
  return { docId, expectedRev, deleted: true, metaCipher: null, blobHash: null };
}

export async function putDoc(
  actor: Actor,
  docId: DocId,
  expectedRev: number | null,
  body: PutDocRequest,
): Promise<DocWriteResult> {
  const result = await writeDocs({
    ...actor,
    seqMode: 'shared',
    ops: [{ docId, expectedRev, deleted: false, metaCipher: body.metaCipher, blobHash: body.blobHash }],
  });
  const ok = expectOk(result);
  announce(actor, result);
  return { rev: ok.rev, seq: ok.seq };
}

export async function deleteDoc(actor: Actor, docId: DocId, expectedRev: number): Promise<DocWriteResult> {
  const result = await writeDocs({ ...actor, seqMode: 'shared', ops: [tombstone(docId, expectedRev)] });
  const ok = expectOk(result);
  announce(actor, result);
  return { rev: ok.rev, seq: ok.seq };
}

/**
 * Переезд одной транзакцией и под одним seq: гашение старого docId и создание нового
 * с тем же телом. Пара из DELETE и PUT дала бы окно, в котором другой участник
 * увидит файл исчезнувшим и удалит его у себя.
 */
export async function moveDoc(actor: Actor, body: MoveDocRequest): Promise<DocWriteResult> {
  const result = await writeDocs({
    ...actor,
    seqMode: 'shared',
    ops: [
      tombstone(body.fromDocId, body.fromRev),
      {
        docId: body.toDocId,
        // Цель может существовать (переезд поверх файла), условие на неё не ставится.
        expectedRev: undefined,
        deleted: false,
        metaCipher: body.metaCipher,
        blobHash: body.blobHash,
      },
    ],
  });
  // rev и seq в ответе относятся к документу назначения.
  const ok = expectOk(result, 1);
  announce(actor, result);
  return { rev: ok.rev, seq: ok.seq };
}

/** Батч: отказ по одному документу не отменяет остальные, каждый получает свой seq. */
export async function batchDocs(actor: Actor, items: BatchDocItem[]): Promise<BatchDocResult[]> {
  const result = await writeDocs({
    ...actor,
    seqMode: 'per-op',
    continueOnError: true,
    ops: items.map((item) => ({
      docId: item.docId,
      expectedRev: item.expectedRev,
      deleted: false,
      metaCipher: item.metaCipher,
      blobHash: item.blobHash,
    })),
  });

  announce(actor, result);

  return result.results.map((outcome) =>
    'error' in outcome
      ? { docId: outcome.docId, error: outcome.error.toBody() }
      : { docId: outcome.docId, rev: outcome.rev, seq: outcome.seq },
  );
}
