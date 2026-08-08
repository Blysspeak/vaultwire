import type { ChangeItem, DocId } from '@vaultwire/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { listTrash, restoreFromTrash } from '../trash';
import type { HistoryDeps } from '../types';
import { DOC_ID, FakeHistoryApi, FakeRestoreVault, SPACE_ID, blobHash, testKeys } from './fakes';

const OTHER_DOC = 'b'.repeat(43) as DocId;

let api: FakeHistoryApi;
let deps: HistoryDeps;

function change(docId: DocId, rev: number, deleted: boolean): ChangeItem {
  return {
    docId,
    rev,
    seq: rev,
    deleted,
    metaCipher: null,
    blobHash: deleted ? null : blobHash(String(rev)),
    size: 10,
  };
}

beforeEach(async () => {
  const keys = await testKeys();
  api = new FakeHistoryApi(keys);
  deps = { client: api, spaceId: SPACE_ID, keys };
});

describe('список корзины', () => {
  it('показывает только надгробия, с путём и временем из истории', async () => {
    api.changes = {
      seq: 3,
      items: [change(OTHER_DOC, 1, false), change(DOC_ID, 3, true)],
    };
    await api.seed([
      { rev: 2, text: 'жила была', path: 'Папка/Заметка.md' },
      { rev: 3, deleted: true, createdAt: 7_000 },
    ]);
    const items = await listTrash(deps);
    expect(items).toEqual([
      {
        docId: DOC_ID,
        path: 'Папка/Заметка.md',
        size: 17,
        deletedAt: 7_000,
        deletedBy: 'device-1',
        restoreRev: 2,
      },
    ]);
  });

  it('документ без живой ревизии восстановить нечем', async () => {
    api.changes = { seq: 1, items: [change(DOC_ID, 1, true)] };
    await api.seed([{ rev: 1, deleted: true }]);
    const [item] = await listTrash(deps);
    expect(item?.restoreRev).toBeNull();
    const vault = new FakeRestoreVault();
    const result = await restoreFromTrash(deps, vault, item!, 'Заметка.md', 1_000);
    expect(result.outcome).toBe('missing');
    expect(vault.writes).toBe(0);
  });
});
