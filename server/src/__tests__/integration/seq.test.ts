import { expect, it } from 'vitest';
import {
  batchDocsResponseSchema,
  changesResponseSchema,
  docWriteResultSchema,
  getSpaceResponseSchema,
  type BatchDocItem,
} from '@vaultwire/shared';
import { bodyOf, docIdOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

const PARALLEL_WRITES = 10;
const BATCH_SIZE = 50;
const BATCH_FAILURES = 2;

describeIntegration('монотонность seq', () => {
  const harness = useHarness();

  it('десять параллельных записей получают подряд идущие seq: без дырок и без повторов', async () => {
    const space = await createSpaceFixture(harness());
    const blob = await uploadBlobOk(space.writer, Buffer.from('тело для параллельных записей'));

    const responses = await Promise.all(
      Array.from({ length: PARALLEL_WRITES }, (_unused, index) => {
        const name = `parallel-${index}`;
        return space.writer.putDoc(docIdOf(name), docBody(name, blob), 'create');
      }),
    );

    for (const response of responses) expect(response.statusCode).toBe(200);

    const seqs = responses
      .map((response) => bodyOf(response, docWriteResultSchema).seq)
      .sort((left, right) => left - right);

    // Дырка в нумерации молча теряется опросом changes, повтор молча его обрывает.
    expect(seqs).toEqual(Array.from({ length: PARALLEL_WRITES }, (_unused, index) => index + 1));

    const overview = bodyOf(await space.writer.space(), getSpaceResponseSchema);
    expect(overview.seq).toBe(PARALLEL_WRITES);
    expect(overview.docCount).toBe(PARALLEL_WRITES);
  });

  it('батч из пятидесяти документов проходит одной транзакцией и двигает seq на число успешных', async () => {
    const space = await createSpaceFixture(harness());
    const blob = await uploadBlobOk(space.writer, Buffer.from('тело батча'));

    const items: BatchDocItem[] = Array.from({ length: BATCH_SIZE }, (_unused, index) => {
      const name = `batch-${index}`;
      // Хвост заведомо отказной: ожидаемая ревизия у ещё не созданного документа.
      const expectedRev = index < BATCH_SIZE - BATCH_FAILURES ? null : 3;
      return { docId: docIdOf(name), ...docBody(name, blob), expectedRev };
    });

    const before = bodyOf(await space.writer.space(), getSpaceResponseSchema).seq;
    const response = await space.writer.batch(items);
    expect(response.statusCode).toBe(200);

    const seqs: number[] = [];
    const codes: string[] = [];
    for (const result of bodyOf(response, batchDocsResponseSchema)) {
      if ('error' in result) codes.push(result.error.code);
      else seqs.push(result.seq);
    }

    const expectedOk = BATCH_SIZE - BATCH_FAILURES;
    expect(codes).toEqual(Array.from({ length: BATCH_FAILURES }, () => 'revision_mismatch'));
    expect(seqs.sort((left, right) => left - right)).toEqual(
      Array.from({ length: expectedOk }, (_unused, index) => before + index + 1),
    );

    const after = bodyOf(await space.writer.space(), getSpaceResponseSchema).seq;
    expect(after - before).toBe(expectedOk);

    // Транзакция была одна: успешные документы видны разом.
    const changes = bodyOf(await space.writer.changes(before), changesResponseSchema);
    expect(changes.items).toHaveLength(expectedOk);
  });
});
