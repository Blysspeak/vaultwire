import type { DocId, SpaceId } from '@vaultwire/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StateAdapter } from '../../engine/state-file';
import type { ConflictFiles } from '../registry';
import { ConflictRegistry } from '../registry';
import type { ConflictRecord } from '../registry-file';

const SPACE = 'space-1' as SpaceId;
const DOC = 'a'.repeat(43) as DocId;
const COPY = 'Заметка (конфликт, ноутбук, 2026-08-08 14-30).md';

/** Файловая система на памяти: адаптер хранилища Obsidian сюда не нужен. */
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

class MemoryFiles implements ConflictFiles {
  readonly present = new Set<string>();
  readonly trashed: string[] = [];
  readonly renamed: Array<[string, string]> = [];

  exists(path: string): boolean {
    return this.present.has(path);
  }

  rename(from: string, to: string): Promise<void> {
    this.renamed.push([from, to]);
    this.present.delete(from);
    this.present.add(to);
    return Promise.resolve();
  }

  trash(path: string): Promise<void> {
    this.trashed.push(path);
    this.present.delete(path);
    return Promise.resolve();
  }
}

const record: ConflictRecord = {
  docId: DOC,
  path: 'Заметка.md',
  copyPath: COPY,
  at: 1_000,
  outcome: 'copy',
  refusal: null,
};

let adapter: MemoryAdapter;
let files: MemoryFiles;

beforeEach(() => {
  adapter = new MemoryAdapter();
  files = new MemoryFiles();
  files.present.add('Заметка.md');
  files.present.add(COPY);
});

function registry(): ConflictRegistry {
  return new ConflictRegistry(adapter, '.obsidian', SPACE);
}

describe('реестр конфликтов', () => {
  it('переживает перезапуск', async () => {
    const first = registry();
    await first.add(record);
    const second = registry();
    await second.load();
    expect(second.all()).toEqual([record]);
  });

  it('битый файл реестра не роняет подключение', async () => {
    const registryOne = registry();
    adapter.files.set(registryOne.path, '{ мусор');
    await registryOne.load();
    expect(registryOne.all()).toEqual([]);
  });

  it('«оставить мою» переносит копию в основной путь через корзину', async () => {
    const store = registry();
    await store.add(record);
    expect(await store.keepMine(files, DOC)).toBe(true);
    expect(files.trashed).toEqual(['Заметка.md']);
    expect(files.renamed).toEqual([[COPY, 'Заметка.md']]);
    expect(store.all()).toEqual([]);
  });

  it('«оставить серверную» убирает копию', async () => {
    const store = registry();
    await store.add(record);
    expect(await store.keepServer(files, DOC)).toBe(true);
    expect(files.trashed).toEqual([COPY]);
    expect(store.all()).toEqual([]);
  });

  it('очистка убирает и чужие копии, найденные по имени', async () => {
    const alien = 'Папка/Другая (конфликт, iPhone, 2026-08-08 09-00).md';
    files.present.add(alien);
    const store = registry();
    await store.add(record);
    const removed = await store.clearCopies(files, [alien, 'Заметка.md']);
    expect(removed.sort()).toEqual([alien, COPY].sort());
    expect(files.trashed).not.toContain('Заметка.md');
    expect(store.all()).toEqual([]);
  });
});
