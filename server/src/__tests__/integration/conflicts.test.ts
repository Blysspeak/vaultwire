import { expect, it } from 'vitest';
import { changesResponseSchema, docWriteResultSchema, getSpaceResponseSchema } from '@vaultwire/shared';
import { bodyOf, docIdOf, errorOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

describeIntegration('условная запись документа', () => {
  const harness = useHarness();

  it('устаревший If-Match даёт revision_mismatch с текущим rev и не меняет документ', async () => {
    const space = await createSpaceFixture(harness());
    const first = await uploadBlobOk(space.writer, Buffer.from('первая версия'));
    const second = await uploadBlobOk(space.writer, Buffer.from('вторая версия'));
    const docId = docIdOf('stale-if-match');

    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('stale-if-match', first), 'create'),
      docWriteResultSchema,
    );
    const updated = bodyOf(
      await space.writer.putDoc(docId, docBody('stale-if-match', second), created.rev),
      docWriteResultSchema,
    );
    expect([created.rev, updated.rev]).toEqual([1, 2]);

    const stale = await space.writer.putDoc(docId, docBody('stale-if-match', first), created.rev);
    expect(stale.statusCode).toBe(409);

    const failure = errorOf(stale);
    expect(failure.code).toBe('revision_mismatch');
    // Без текущего rev в ответе клиенту нечем разрешить конфликт.
    expect(failure.details).toMatchObject({ rev: updated.rev, deleted: false });

    const changes = bodyOf(await space.writer.changes(0), changesResponseSchema);
    expect(changes.seq).toBe(updated.seq);
    expect(changes.items).toEqual([
      expect.objectContaining({ docId, rev: updated.rev, deleted: false, blobHash: second.hash }),
    ]);
  });

  it('создание с If-None-Match на занятом docId даёт конфликт', async () => {
    const space = await createSpaceFixture(harness());
    const blob = await uploadBlobOk(space.writer, Buffer.from('занятое место'));
    const docId = docIdOf('occupied');

    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('occupied', blob), 'create'),
      docWriteResultSchema,
    );

    const again = await space.writer.putDoc(docId, docBody('occupied-again', blob), 'create');
    expect(again.statusCode).toBe(409);

    const failure = errorOf(again);
    expect(failure.code).toBe('revision_mismatch');
    expect(failure.details).toMatchObject({ rev: created.rev, deleted: false });

    // Отказ ничего не записал: ни ревизии, ни seq пространства.
    const overview = bodyOf(await space.writer.space(), getSpaceResponseSchema);
    expect(overview.seq).toBe(created.seq);
    const changes = bodyOf(await space.writer.changes(0), changesResponseSchema);
    expect(changes.items).toEqual([expect.objectContaining({ docId, rev: created.rev })]);
  });
});
