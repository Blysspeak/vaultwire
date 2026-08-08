import { describe, expect, it } from 'vitest';
import { ConnectionIndex } from '../state';
import { STATE_VERSION, parseState, statePath, writeStateAtomic } from '../state-file';
import { FakeAdapter } from './fake-vault';
import { TEST_SPACE, docIdFor, entry } from './fakes';

const CONFIG_DIR = '.obsidian';
const PATH = `${CONFIG_DIR}/plugins/vaultwire/state-${TEST_SPACE}.json`;

/** Ручной таймер вместо setTimeout: дебаунс проверяется без ожидания. */
function manualTimer(): { index: (adapter: FakeAdapter) => ConnectionIndex; fire: () => void } {
  const pending: Array<() => void> = [];
  return {
    index: (adapter) =>
      new ConnectionIndex(adapter, {
        configDir: CONFIG_DIR,
        spaceId: TEST_SPACE,
        schedule: (run) => {
          pending.push(run);
          return pending.length;
        },
        cancel: () => undefined,
      }),
    fire: () => {
      const run = pending.shift();
      if (run !== undefined) run();
    },
  };
}

describe('файл индекса', () => {
  it('путь лежит в папке плагина и содержит spaceId', () => {
    expect(statePath(CONFIG_DIR, TEST_SPACE)).toBe(PATH);
  });

  it('запись атомарна: сначала временный файл, потом переименование', async () => {
    const adapter = new FakeAdapter();
    const state = { version: STATE_VERSION, spaceId: TEST_SPACE, lastSeq: 3, entries: [entry('a.md')] };
    await writeStateAtomic(adapter, CONFIG_DIR, state);
    expect(adapter.writes).toEqual([`${PATH}.tmp`]);
    expect(adapter.renames).toEqual([[`${PATH}.tmp`, PATH]]);
    expect(adapter.files.has(PATH)).toBe(true);
  });

  it('битый файл даёт пустой индекс, а не падение', () => {
    expect(parseState('{не json', TEST_SPACE).entries).toEqual([]);
    expect(parseState('{"version":99}', TEST_SPACE).lastSeq).toBe(0);
  });

  it('записи с недостающими полями отбрасываются', () => {
    const json = JSON.stringify({
      version: STATE_VERSION,
      spaceId: TEST_SPACE,
      lastSeq: 1,
      entries: [entry('a.md'), { path: 'b.md' }],
    });
    expect(parseState(json, TEST_SPACE).entries.map((e) => e.path)).toEqual(['a.md']);
  });
});

describe('индекс подключения', () => {
  it('загружает записи и seq с диска', async () => {
    const adapter = new FakeAdapter();
    await writeStateAtomic(adapter, CONFIG_DIR, {
      version: STATE_VERSION,
      spaceId: TEST_SPACE,
      lastSeq: 12,
      entries: [entry('a.md')],
    });
    const index = manualTimer().index(adapter);
    await index.load();
    expect(index.lastSeq).toBe(12);
    expect(index.get('a.md')?.plainHash).toBe('hash:a.md');
    expect(index.getByDocId(docIdFor('a.md'))?.path).toBe('a.md');
  });

  it('пустой файл индекса не мешает первому запуску', async () => {
    const index = manualTimer().index(new FakeAdapter());
    await index.load();
    expect(index.all()).toEqual([]);
    expect(index.lastSeq).toBe(0);
  });

  it('правки копятся и уходят на диск одной записью по дебаунсу', async () => {
    const adapter = new FakeAdapter();
    const timer = manualTimer();
    const index = timer.index(adapter);
    await index.load();
    index.set(entry('a.md'));
    index.set(entry('b.md'));
    index.setLastSeq(5);
    expect(adapter.writes).toEqual([]);
    timer.fire();
    await index.flush();
    expect(adapter.writes).toEqual([`${PATH}.tmp`]);
    const saved = parseState(adapter.files.get(PATH) ?? '', TEST_SPACE);
    expect(saved.entries.map((e) => e.path).sort()).toEqual(['a.md', 'b.md']);
    expect(saved.lastSeq).toBe(5);
  });

  it('flush без правок не трогает диск', async () => {
    const adapter = new FakeAdapter();
    const index = manualTimer().index(adapter);
    await index.load();
    await index.flush();
    expect(adapter.writes).toEqual([]);
  });

  it('удаление снимает запись и с пути, и с docId', async () => {
    const index = manualTimer().index(new FakeAdapter());
    await index.load();
    index.set(entry('a.md'));
    index.delete('a.md');
    expect(index.get('a.md')).toBeUndefined();
    expect(index.getByDocId(docIdFor('a.md'))).toBeUndefined();
  });

  it('флаг dirty переживает сохранение: офлайн-правка не теряется', async () => {
    const adapter = new FakeAdapter();
    const index = manualTimer().index(adapter);
    await index.load();
    index.set(entry('a.md'));
    index.markDirty('a.md', true);
    await index.flush();
    expect(parseState(adapter.files.get(PATH) ?? '', TEST_SPACE).entries[0]?.dirty).toBe(true);
  });
});
