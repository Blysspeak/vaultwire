import { describe, expect, it } from 'vitest';
import type { ConflictDeps, ConflictInput, ConflictSide } from '../resolve';
import { resolveConflict } from '../resolve';
import { planReadOnlyPull } from '../ro-guard';

const NOW = new Date(2026, 7, 8, 14, 30).getTime();

const local: ConflictSide = { data: 'моя версия', mtime: 2_000, ctime: 100 };
const remote: ConflictSide = { data: 'серверная версия', mtime: 1_000, ctime: 100 };

const deps: ConflictDeps = { exists: () => false };

function input(overrides: Partial<ConflictInput> = {}): ConflictInput {
  return {
    path: 'Заметка.md',
    strategy: 'copy',
    deviceLabel: 'ноутбук',
    local,
    remote,
    now: NOW,
    ...overrides,
  };
}

const COPY_PATH = 'Заметка (конфликт, ноутбук, 2026-08-08 14-30).md';

describe('стратегия «конфликтная копия»', () => {
  it('серверная версия ложится в основной путь, локальная уходит в копию', async () => {
    const result = await resolveConflict(input(), deps);
    expect(result.outcome).toBe('copy');
    expect(result.copyPath).toBe(COPY_PATH);
    expect(result.push).toBe(false);
    // Копия пишется первой: обрыв не должен унести локальную версию.
    expect(result.writes.map((write) => write.path)).toEqual([COPY_PATH, 'Заметка.md']);
    expect(result.writes[0]?.data).toBe('моя версия');
    expect(result.writes[1]?.data).toBe('серверная версия');
  });

  it('без локального файла конфликта нет', async () => {
    const result = await resolveConflict(input({ local: null }), deps);
    expect(result).toMatchObject({ outcome: 'server', copyPath: null, push: false });
    expect(result.writes).toHaveLength(1);
  });
});

describe('стратегия «побеждает свежий»', () => {
  it('свежая локальная остаётся на месте и уходит на сервер', async () => {
    const result = await resolveConflict(input({ strategy: 'newest' }), deps);
    expect(result).toMatchObject({ outcome: 'local', push: true, copyPath: null });
    expect(result.writes).toHaveLength(0);
  });

  it('свежая серверная затирает локальную', async () => {
    const stale: ConflictSide = { ...local, mtime: 500 };
    const result = await resolveConflict(input({ strategy: 'newest', local: stale }), deps);
    expect(result).toMatchObject({ outcome: 'server', push: false });
  });
});

describe('стратегия «автослияние»', () => {
  it('успешное слияние ложится в основной путь и отправляется', async () => {
    const merging: ConflictDeps = {
      exists: () => false,
      merge: () => Promise.resolve({ ok: true, text: 'слитая версия' }),
    };
    const result = await resolveConflict(input({ strategy: 'merge' }), merging);
    expect(result).toMatchObject({ outcome: 'merged', push: true, copyPath: null });
    expect(result.writes[0]).toMatchObject({ path: 'Заметка.md', data: 'слитая версия' });
  });

  it('отказ слияния откатывается к конфликтной копии с причиной', async () => {
    const refusing: ConflictDeps = {
      exists: () => false,
      merge: () => Promise.resolve({ ok: false, refusal: 'frontmatter' }),
    };
    const result = await resolveConflict(input({ strategy: 'merge' }), refusing);
    expect(result).toMatchObject({ outcome: 'copy', refusal: 'frontmatter', copyPath: COPY_PATH });
  });
});

describe('роль только для чтения', () => {
  const base = {
    path: 'Заметка.md',
    deviceLabel: 'ноутбук',
    now: NOW,
    local,
    remote,
  };

  it('нетронутая локальная версия просто заменяется серверной', async () => {
    const result = await planReadOnlyPull(
      { ...base, localHash: 'aa', indexHash: 'aa' },
      deps,
    );
    expect(result).toMatchObject({ outcome: 'server', copyPath: null, push: false });
  });

  it('расхождение с индексом сохраняется отдельным файлом, а не затирается', async () => {
    const result = await planReadOnlyPull(
      { ...base, localHash: 'bb', indexHash: 'aa' },
      deps,
    );
    expect(result).toMatchObject({ outcome: 'copy', copyPath: COPY_PATH, push: false });
    expect(result.writes.map((write) => write.path)).toEqual([COPY_PATH, 'Заметка.md']);
  });

  it('файл вне индекса тоже не теряется', async () => {
    const result = await planReadOnlyPull(
      { ...base, localHash: 'bb', indexHash: undefined },
      deps,
    );
    expect(result.copyPath).toBe(COPY_PATH);
  });

  it('роль ro никогда не отправляет, даже когда локальная свежее', async () => {
    const result = await planReadOnlyPull(
      { ...base, localHash: 'bb', indexHash: 'aa' },
      deps,
    );
    expect(result.push).toBe(false);
  });
});
