import { expect, it } from 'vitest';
import {
  changesResponseSchema,
  docWriteResultSchema,
  revokeDeviceResponseSchema,
  type BatchDocItem,
} from '@vaultwire/shared';
import { bodyOf, docIdOf, errorOf, metaOf } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

const INVITE_TTL_MS = 60 * 60 * 1000;

describeIntegration('доступ устройства', () => {
  const harness = useHarness();

  it('отзыв делает токен нерабочим немедленно, несмотря на кэш проверенных токенов', async () => {
    const space = await createSpaceFixture(harness());

    // Первый запрос кладёт устройство в кэш на минуту: отзыв обязан его вычистить.
    expect((await space.writer.space()).statusCode).toBe(200);

    const revoked = await space.owner.revokeDevice(space.writerDeviceId);
    expect(revoked.statusCode).toBe(200);
    expect(bodyOf(revoked, revokeDeviceResponseSchema).deviceId).toBe(space.writerDeviceId);

    const afterRevoke = await space.writer.space();
    expect(afterRevoke.statusCode).toBe(401);
    expect(errorOf(afterRevoke).code).toBe('unauthorized');
  });

  it('роль только для чтения получает forbidden на всех изменяющих запросах', async () => {
    const space = await createSpaceFixture(harness());
    const blob = await uploadBlobOk(space.writer, Buffer.from('тело для проверки роли'));
    const docId = docIdOf('read-only');
    const created = bodyOf(
      await space.writer.putDoc(docId, docBody('read-only', blob), 'create'),
      docWriteResultSchema,
    );

    for (const allowed of [space.reader.space(), space.reader.changes(0), space.reader.readBlob(blob.hash)]) {
      expect((await allowed).statusCode).toBe(200);
    }

    const item: BatchDocItem = {
      docId: docIdOf('read-only-batch'),
      ...docBody('read-only-batch', blob),
      expectedRev: null,
    };

    const attempts = await Promise.all([
      space.reader.putDoc(docId, docBody('read-only', blob), created.rev),
      space.reader.deleteDoc(docId, created.rev),
      space.reader.batch([item]),
      space.reader.move({
        fromDocId: docId,
        fromRev: created.rev,
        toDocId: docIdOf('read-only-move'),
        metaCipher: metaOf('read-only-move'),
        blobHash: blob.hash,
      }),
      space.reader.uploadBlob(Buffer.from('чужое тело')),
      space.reader.createInvite({ role: 'ro', expiresIn: INVITE_TTL_MS, maxUses: 1 }),
      space.reader.listDevices(),
      space.reader.revokeDevice(space.writerDeviceId),
    ]);

    for (const attempt of attempts) {
      expect(attempt.statusCode).toBe(403);
      expect(errorOf(attempt).code).toBe('forbidden');
    }

    // Ни один отказ ничего не записал.
    const changes = bodyOf(await space.reader.changes(0), changesResponseSchema);
    expect(changes.seq).toBe(created.seq);
    expect(changes.items).toEqual([expect.objectContaining({ docId, rev: created.rev, deleted: false })]);
  });
});
