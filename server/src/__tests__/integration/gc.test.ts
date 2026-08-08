import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { getSpaceResponseSchema } from '@vaultwire/shared';
import { bodyOf, docIdOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { blobPath, useHarness } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;

describeIntegration('сборка мусора', () => {
  const harness = useHarness();

  it('удаляет тело без ссылок с истёкшей отсрочкой и не трогает тело, на которое ссылается ревизия', async () => {
    const stand = harness();
    const space = await createSpaceFixture(stand);

    const referenced = await uploadBlobOk(space.writer, Buffer.from('тело со ссылкой'));
    const orphan = await uploadBlobOk(space.writer, Buffer.from('тело без единой ссылки'));
    const put = await space.writer.putDoc(docIdOf('kept'), docBody('kept', referenced), 'create');
    expect(put.statusCode).toBe(200);

    // Отсрочка для тела без ссылок сутки: только что залитое штатно живёт без ссылок.
    const past = new Date(Date.now() - 2 * DAY_MS);
    await stand.prisma.blob.updateMany({ where: { spaceId: space.spaceId }, data: { createdAt: past } });

    await stand.collectGarbage(space.spaceId);

    const orphanRow = await stand.prisma.blob.findUnique({
      where: { spaceId_hash: { spaceId: space.spaceId, hash: orphan.hash } },
    });
    expect(orphanRow).toBeNull();
    expect(existsSync(blobPath(stand, space.spaceId, orphan.hash))).toBe(false);

    const keptRow = await stand.prisma.blob.findUniqueOrThrow({
      where: { spaceId_hash: { spaceId: space.spaceId, hash: referenced.hash } },
    });
    expect(keptRow.refCount).toBe(1);
    expect(existsSync(blobPath(stand, space.spaceId, referenced.hash))).toBe(true);
    expect((await space.reader.readBlob(referenced.hash)).statusCode).toBe(200);

    // После сноса тел занятый объём пересчитывается по оставшимся строкам.
    const overview = bodyOf(await space.reader.space(), getSpaceResponseSchema);
    expect(overview.bytes).toBe(referenced.size);
  });
});
