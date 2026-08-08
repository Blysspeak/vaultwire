import { describe, expect, it } from 'vitest';
import { STATE_VERSION, parseState, statePath, writeStateAtomic } from '../state-file';
import { FakeAdapter } from './fake-vault';
import { TEST_SPACE, entry } from './fakes';
import { CONFIG_DIR, STATE_PATH as PATH } from './manual-timer';

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

  it('запись старого формата читается: автор и направление становятся null', () => {
    const old = { ...entry('a.md') } as Record<string, unknown>;
    delete old['lastAuthor'];
    delete old['lastDirection'];
    const json = JSON.stringify({
      version: STATE_VERSION,
      spaceId: TEST_SPACE,
      lastSeq: 1,
      entries: [old],
    });
    const [parsed] = parseState(json, TEST_SPACE).entries;
    expect(parsed?.path).toBe('a.md');
    expect(parsed?.lastAuthor).toBeNull();
    expect(parsed?.lastDirection).toBeNull();
  });

  it('чужое значение направления не проходит в индекс', () => {
    const json = JSON.stringify({
      version: STATE_VERSION,
      spaceId: TEST_SPACE,
      lastSeq: 1,
      entries: [{ ...entry('a.md'), lastDirection: 'sideways', lastAuthor: 7 }],
    });
    const [parsed] = parseState(json, TEST_SPACE).entries;
    expect(parsed?.lastDirection).toBeNull();
    expect(parsed?.lastAuthor).toBeNull();
  });

  it('автор и направление переживают сохранение', () => {
    const json = JSON.stringify({
      version: STATE_VERSION,
      spaceId: TEST_SPACE,
      lastSeq: 1,
      entries: [entry('a.md', { lastAuthor: 'ПК Влада', lastDirection: 'pull' })],
    });
    const [parsed] = parseState(json, TEST_SPACE).entries;
    expect(parsed?.lastAuthor).toBe('ПК Влада');
    expect(parsed?.lastDirection).toBe('pull');
  });
});
