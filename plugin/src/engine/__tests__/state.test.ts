import { describe, expect, it } from 'vitest';
import { STATE_VERSION, parseState, writeStateAtomic } from '../state-file';
import { FakeAdapter } from './fake-vault';
import { TEST_SPACE, docIdFor, entry } from './fakes';
import { CONFIG_DIR, STATE_PATH as PATH, manualTimer } from './manual-timer';

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
