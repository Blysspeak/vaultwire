import { expect, it } from 'vitest';
import { changesResponseSchema, docWriteResultSchema, type ChangeItem, type DocId } from '@vaultwire/shared';
import { bodyOf, docIdOf, metaOf, type SpaceClient } from './client';
import { describeIntegration } from './env';
import { createSpaceFixture, docBody, uploadBlobOk } from './fixture';
import { useHarness } from './harness';

/** Потолок опросов: без него цикл упёрся бы в лимит запросов на устройство. */
const MAX_POLLS = 400;

/** Цепочка переименований: файл переезжает по кругу имён, не исчезая ни на миг. */
const HOPS = 3;

const nameOf = (hop: number): string => `move-${hop}`;
const docIdAt = (hop: number): DocId => docIdOf(nameOf(hop));

function itemOf(items: ChangeItem[], docId: DocId): ChangeItem | undefined {
  return items.find((item) => item.docId === docId);
}

/** Сколько имён цепочки живо. Всегда ровно одно: ноль это потеря файла, два это дубль. */
function aliveCount(items: ChangeItem[]): number {
  return Array.from({ length: HOPS + 1 }, (_unused, hop) => itemOf(items, docIdAt(hop))).filter(
    (item) => item !== undefined && !item.deleted,
  ).length;
}

async function itemsOf(client: SpaceClient): Promise<ChangeItem[]> {
  return bodyOf(await client.changes(0), changesResponseSchema).items;
}

describeIntegration('переезд документа', () => {
  const harness = useHarness();

  it('атомарен: опрос ни разу не видит состояния, где нет ни старого docId, ни нового', async () => {
    const space = await createSpaceFixture(harness());
    const blob = await uploadBlobOk(space.writer, Buffer.from('переезжающее тело'));

    let rev = bodyOf(
      await space.writer.putDoc(docIdAt(0), docBody(nameOf(0), blob), 'create'),
      docWriteResultSchema,
    ).rev;

    let polling = true;
    const observations: number[] = [];
    const poller = (async () => {
      while (polling && observations.length < MAX_POLLS) {
        observations.push(aliveCount(await itemsOf(space.reader)));
      }
    })();

    let lastSeq = 0;
    for (let hop = 0; hop < HOPS; hop += 1) {
      const moved = bodyOf(
        await space.writer.move({
          fromDocId: docIdAt(hop),
          fromRev: rev,
          toDocId: docIdAt(hop + 1),
          metaCipher: metaOf(nameOf(hop + 1)),
          blobHash: blob.hash,
        }),
        docWriteResultSchema,
      );
      rev = moved.rev;
      lastSeq = moved.seq;
    }
    polling = false;
    await poller;

    expect(observations.length).toBeGreaterThan(0);
    expect([...new Set(observations)]).toEqual([1]);

    const items = await itemsOf(space.reader);
    // Гашение старого и создание нового идут под одним seq: половины переименования не бывает.
    expect(itemOf(items, docIdAt(HOPS - 1))).toMatchObject({ deleted: true, seq: lastSeq });
    expect(itemOf(items, docIdAt(HOPS))).toMatchObject({ deleted: false, seq: lastSeq });
  });
});
