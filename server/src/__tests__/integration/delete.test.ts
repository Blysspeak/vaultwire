import { expect, it } from 'vitest';
import { changesResponseSchema, docWriteResultSchema } from '@vaultwire/shared';
import { bodyOf, docIdOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;

describeIntegration('удаление документа', () => {
  const harness = useHarness();

  /**
   * Реальный клиент шлёт DELETE без тела, но requestUrl проставляет заголовок
   * application/json сам. Стандартный парсер Fastify отвечал на это 415, удаления
   * не проходили вообще, а плагин повторял их по кругу. Инъекция в остальных
   * тестах заголовок не ставит, поэтому случай мимо них проходил незамеченным.
   */
  it('принимает DELETE с заголовком json и пустым телом', async () => {
    const stand = harness();
    const space = await createSpaceFixture(stand);
    const blob = await uploadBlobOk(space.writer, Buffer.from('тело'));
    const docId = docIdOf('delete-with-json-header');
    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('delete-with-json-header', blob), 'create'),
      docWriteResultSchema,
    );

    const response = await stand.app.inject({
      method: 'DELETE',
      url: `/v1/spaces/${space.spaceId}/docs/${docId}`,
      headers: {
        authorization: `Bearer ${space.writerToken}`,
        'content-type': 'application/json',
        'if-match': String(created.rev),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(bodyOf(response, docWriteResultSchema).rev).toBe(created.rev + 1);
  });

  it('ставит надгробие, тело переживает удаление, счётчик ссылок уменьшается после чистки истории', async () => {
    const stand = harness();
    const space = await createSpaceFixture(stand);
    const content = Buffer.from('тело, которое переживёт удаление');
    const blob = await uploadBlobOk(space.writer, content);
    const docId = docIdOf('to-delete');

    const refCount = async (): Promise<number> => {
      const row = await stand.prisma.blob.findUniqueOrThrow({
        where: { spaceId_hash: { spaceId: space.spaceId, hash: blob.hash } },
      });
      return row.refCount;
    };

    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('to-delete', blob), 'create'),
      docWriteResultSchema,
    );
    expect(await refCount()).toBe(1);

    const removed = bodyOf(await space.writer.deleteDoc(docId, created.rev), docWriteResultSchema);
    expect(removed.rev).toBe(created.rev + 1);
    expect(removed.seq).toBe(created.seq + 1);

    const changes = bodyOf(await space.reader.changes(0), changesResponseSchema);
    expect(changes.items).toEqual([
      expect.objectContaining({ docId, rev: removed.rev, deleted: true, metaCipher: null, blobHash: null }),
    ]);

    // Корзина: тело живёт срок хранения и остаётся читаемым после удаления.
    const body = await space.reader.readBlob(blob.hash);
    expect(body.statusCode).toBe(200);
    expect(body.rawPayload.equals(content)).toBe(true);

    // Ссылку держит ревизия, а не документ, поэтому счётчик падает вместе с чисткой истории.
    expect(await refCount()).toBe(1);
    const past = new Date(Date.now() - 2 * DAY_MS);
    await stand.prisma.space.update({
      where: { id: space.spaceId },
      data: { retentionDays: 1, maxRevisions: 1 },
    });
    await stand.prisma.docRev.updateMany({ where: { spaceId: space.spaceId }, data: { createdAt: past } });
    await stand.collectGarbage(space.spaceId);

    expect(await refCount()).toBe(0);
    // Надгробие переживает чистку: без него участник не узнает об удалении.
    const revisions = await stand.prisma.docRev.findMany({ where: { spaceId: space.spaceId } });
    expect(revisions.map((revision) => revision.rev)).toEqual([removed.rev]);
  });
});
