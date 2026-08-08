import { expect, it } from 'vitest';
import { docWriteResultSchema, getSpaceResponseSchema } from '@vaultwire/shared';
import { bodyOf, docIdOf, errorOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUOTA_BYTES = 4_096;
const FIRST_BYTES = 3_000;
const SECOND_BYTES = 2_000;

describeIntegration('квота пространства', () => {
  const harness = useHarness();

  it('превышение даёт quota_exceeded, а занятый объём верен после удалений', async () => {
    const stand = harness();
    const space = await createSpaceFixture(stand, QUOTA_BYTES);
    const usedBytes = async (): Promise<number> =>
      bodyOf(await space.writer.space(), getSpaceResponseSchema).bytes;

    const first = await uploadBlobOk(space.writer, Buffer.alloc(FIRST_BYTES, 1));
    expect(await usedBytes()).toBe(FIRST_BYTES);

    const second = Buffer.alloc(SECOND_BYTES, 2);
    const rejected = await space.writer.uploadBlob(second);
    expect(rejected.statusCode).toBe(507);
    expect(errorOf(rejected).code).toBe('quota_exceeded');
    // Отказ не оставляет ни строки тела, ни занятых байт.
    expect(await usedBytes()).toBe(FIRST_BYTES);

    const docId = docIdOf('quota');
    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('quota', first), 'create'),
      docWriteResultSchema,
    );
    expect((await space.writer.deleteDoc(docId, created.rev)).statusCode).toBe(200);

    // Место освобождает не удаление, а сборка мусора: она снимает ссылку и сносит тело.
    const past = new Date(Date.now() - 2 * DAY_MS);
    await stand.prisma.space.update({
      where: { id: space.spaceId },
      data: { retentionDays: 1, maxRevisions: 1 },
    });
    await stand.prisma.docRev.updateMany({ where: { spaceId: space.spaceId }, data: { createdAt: past } });
    await stand.prisma.blob.updateMany({ where: { spaceId: space.spaceId }, data: { createdAt: past } });
    await stand.collectGarbage(space.spaceId);

    expect(await usedBytes()).toBe(0);
    const retry = await space.writer.uploadBlob(second);
    expect(retry.statusCode).toBe(201);
    expect(await usedBytes()).toBe(SECOND_BYTES);
  });
});
