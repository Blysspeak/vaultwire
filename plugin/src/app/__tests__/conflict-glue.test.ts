import type { DocId, SpaceId } from '@vaultwire/shared';
import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { ConflictRecord } from '../../conflicts/registry-file';
import type { StateAdapter } from '../../engine/state-file';
import { DOC_ID, FakeHistoryApi, SPACE_ID, testKeys } from '../../history/__tests__/fakes';
import type { SpaceKeys } from '../../history/types';
import { RingLog } from '../../log';
import type { ConnectionRuntime, SyncManager } from '../../sync';
import { createConflictGlue } from '../conflict-glue';
import { ConflictRegistries } from '../registries';

/** metadataCache в тестах пуст: область frontmatter считается по тексту. */
const APP = { metadataCache: { getCache: (): null => null } } as unknown as App;

/** Адаптер на памяти: реестр конфликтов пишется атомарно, но без диска. */
class MemoryAdapter implements StateAdapter {
  readonly files = new Map<string, string>();

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
  read(path: string): Promise<string> {
    return Promise.resolve(this.files.get(path) ?? '');
  }
  write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
    return Promise.resolve();
  }
  remove(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }
  rename(from: string, to: string): Promise<void> {
    this.files.set(to, this.files.get(from) ?? '');
    this.files.delete(from);
    return Promise.resolve();
  }
  mkdir(path: string): Promise<void> {
    this.files.set(path, '');
    return Promise.resolve();
  }
}

function runtime(
  folder: string,
  keys: SpaceKeys,
  api: FakeHistoryApi,
  entry: { docId: DocId; rev: number } | null,
): ConnectionRuntime {
  return {
    connection: {
      spaceId: SPACE_ID,
      folder,
      keys,
      client: api,
      index: { get: (): typeof entry => entry },
    },
  } as unknown as ConnectionRuntime;
}

function managerOf(runtimes: readonly ConnectionRuntime[]): SyncManager {
  return { all: (): readonly ConnectionRuntime[] => runtimes } as unknown as SyncManager;
}

function record(path: string): ConflictRecord {
  return { docId: DOC_ID, path, copyPath: null, at: 42, outcome: 'copy', refusal: null };
}

async function setup(folder: string, entry: { docId: DocId; rev: number } | null) {
  const keys = await testKeys();
  const api = new FakeHistoryApi(keys);
  await api.seed([{ rev: 3, text: 'a\nb\n' }]);
  const registries = new ConflictRegistries(new MemoryAdapter(), '.obsidian', new RingLog());
  const manager = managerOf([runtime(folder, keys, api, entry)]);
  const glue = createConflictGlue({
    app: APP,
    manager: () => manager,
    registries,
    log: new RingLog(),
  });
  return { glue, registries, api };
}

describe('createConflictGlue.merge', () => {
  it('сливает, когда база нашлась по записи индекса', async () => {
    const { glue } = await setup('Команда', { docId: DOC_ID, rev: 3 });
    const outcome = await glue.merge({
      path: 'Команда/Заметка.md',
      local: 'a\nb\nc\n',
      remote: 'x\nb\n',
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toContain('c');
  });

  it('без записи в индексе базы нет: отказ no-base', async () => {
    const { glue } = await setup('Команда', null);
    const outcome = await glue.merge({
      path: 'Команда/Заметка.md',
      local: 'a\nb\nc\n',
      remote: 'x\nb\n',
    });
    expect(outcome).toEqual({ ok: false, refusal: 'no-base' });
  });

  it('путь вне папки подключения не ходит на сервер', async () => {
    const { glue, api } = await setup('Команда', { docId: DOC_ID, rev: 3 });
    const outcome = await glue.merge({ path: 'Личное/Заметка.md', local: 'a\n', remote: 'b\n' });
    expect(outcome).toEqual({ ok: false, refusal: 'no-base' });
    expect(api.revisionCalls).toBe(0);
  });
});

describe('createConflictGlue.onConflict', () => {
  it('кладёт запись в реестр пространства, которому принадлежит путь', async () => {
    const { glue, registries } = await setup('Команда', { docId: DOC_ID, rev: 3 });
    await glue.onConflict(record('Команда/Заметка.md'));
    expect(registries.get(SPACE_ID)?.all()).toHaveLength(1);
  });

  it('чужой путь не создаёт реестра', async () => {
    const { glue, registries } = await setup('Команда', { docId: DOC_ID, rev: 3 });
    await glue.onConflict(record('Личное/Заметка.md'));
    expect(registries.get('space-1' as SpaceId)).toBeUndefined();
  });
});
