import { beforeEach, describe, expect, it } from 'vitest';
import { utf8Decode } from '../../crypto';
import { lastLiveRevision, listRevisions, restoreRevision } from '../revisions';
import type { TrashItem } from '../trash';
import { restoreFromTrash } from '../trash';
import type { HistoryDeps } from '../types';
import { DEVICE_ID, DOC_ID, FakeHistoryApi, FakeRestoreVault, SPACE_ID, testKeys } from './fakes';

let api: FakeHistoryApi;
let deps: HistoryDeps;
let vault: FakeRestoreVault;

beforeEach(async () => {
  const keys = await testKeys();
  api = new FakeHistoryApi(keys);
  await api.seed([
    { rev: 1, text: 'первая версия' },
    { rev: 2, text: 'вторая версия' },
  ]);
  deps = { client: api, spaceId: SPACE_ID, keys };
  vault = new FakeRestoreVault();
});

function text(path: string): string {
  const data = vault.files.get(path);
  return data === undefined ? '' : utf8Decode(new Uint8Array(data));
}

describe('список ревизий', () => {
  it('метаданные расшифровываются, порядок от свежей к старой', async () => {
    const revisions = await listRevisions(deps, DOC_ID);
    expect(revisions.map((item) => item.rev)).toEqual([2, 1]);
    expect(revisions[0]).toMatchObject({ path: 'Заметка.md', deviceLabel: 'ноутбук' });
  });

  it('надгробие остаётся без метаданных и не считается точкой восстановления', async () => {
    await api.seed([
      { rev: 1, text: 'живая' },
      { rev: 2, deleted: true },
    ]);
    const revisions = await listRevisions(deps, DOC_ID);
    expect(revisions[0]).toMatchObject({ rev: 2, deleted: true, path: null, blobHash: null });
    expect(lastLiveRevision(revisions)?.rev).toBe(1);
  });
});

describe('восстановление ревизии', () => {
  it('кладёт старое содержимое новой записью', async () => {
    const result = await restoreRevision(deps, vault, {
      docId: DOC_ID,
      rev: 1,
      vaultPath: 'Заметка.md',
      now: 9_000,
    });
    expect(result.outcome).toBe('restored');
    expect(text('Заметка.md')).toBe('первая версия');
  });

  it('повтор не пишет второй раз: операция идемпотентна', async () => {
    const request = { docId: DOC_ID, rev: 1, vaultPath: 'Заметка.md', now: 9_000 };
    await restoreRevision(deps, vault, request);
    const again = await restoreRevision(deps, vault, request);
    expect(again.outcome).toBe('unchanged');
    expect(vault.writes).toBe(1);
    expect(text('Заметка.md')).toBe('первая версия');
  });

  it('ревизия без тела не восстанавливается', async () => {
    await api.seed([{ rev: 1, deleted: true }]);
    const result = await restoreRevision(deps, vault, {
      docId: DOC_ID,
      rev: 1,
      vaultPath: 'Заметка.md',
      now: 9_000,
    });
    expect(result.outcome).toBe('missing');
    expect(vault.writes).toBe(0);
  });
});

describe('корзина', () => {
  it('восстанавливает последнюю живую ревизию и повторяется без записи', async () => {
    await api.seed([
      { rev: 1, text: 'жила была' },
      { rev: 2, deleted: true },
    ]);
    const item: TrashItem = {
      docId: DOC_ID,
      path: 'Заметка.md',
      size: 9,
      deletedAt: 2_000,
      deletedBy: DEVICE_ID,
      restoreRev: 1,
    };
    const first = await restoreFromTrash(deps, vault, item, 'Заметка.md', 9_000);
    const second = await restoreFromTrash(deps, vault, item, 'Заметка.md', 9_100);
    expect([first.outcome, second.outcome]).toEqual(['restored', 'unchanged']);
    expect(vault.writes).toBe(1);
    expect(text('Заметка.md')).toBe('жила была');
  });
});
