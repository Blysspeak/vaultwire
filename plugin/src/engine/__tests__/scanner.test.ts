import { describe, expect, it } from 'vitest';
import { globToRegExp, isHardExcluded, isIncluded, isTempFile } from '../path-filter';
import { scanConnection } from '../scanner';
import type { ScanFile, ScanOptions } from '../scanner';
import { entry } from './fakes';

function file(path: string, size = 10, mtime = 1000): ScanFile {
  return { path, stat: { mtime, ctime: 500, size } };
}

const options: ScanOptions = { folder: '', include: [], exclude: [], maxFileBytes: 1_000 };

describe('фильтры путей', () => {
  it('жёсткие исключения ловят служебные папки на любом уровне', () => {
    expect(isHardExcluded('.obsidian/plugins/x.json')).toBe(true);
    expect(isHardExcluded('.trash/a.md')).toBe(true);
    expect(isHardExcluded('sub/.git/config')).toBe(true);
    expect(isHardExcluded('sub/a.md')).toBe(false);
  });

  it('временные файлы редакторов не синхронизируются', () => {
    expect(isTempFile('~$doc.docx')).toBe(true);
    expect(isTempFile('sub/a.md.tmp')).toBe(true);
    expect(isTempFile('sub/.DS_Store')).toBe(true);
    expect(isTempFile('sub/a.md')).toBe(false);
  });

  it('маска ** перекрывает разделитель, * — нет', () => {
    expect(globToRegExp('**/*.md').test('a/b/c.md')).toBe(true);
    expect(globToRegExp('sub/*.md').test('sub/deep/c.md')).toBe(false);
    expect(isIncluded('notes/a.md', ['notes/**'], [])).toBe(true);
    expect(isIncluded('other/a.md', ['notes/**'], [])).toBe(false);
    expect(isIncluded('notes/secret.md', [], ['**/secret.md'])).toBe(false);
  });
});

describe('сверочный скан', () => {
  it('делит файлы на созданные, изменённые и нетронутые', () => {
    const index = [
      entry('same.md', { mtime: 1000, size: 10 }),
      entry('changed.md', { mtime: 1000, size: 10 }),
      entry('gone.md'),
    ];
    const result = scanConnection(
      [file('same.md'), file('changed.md', 42, 2000), file('fresh.md')],
      index,
      options,
    );
    expect(result.unchanged).toEqual(['same.md']);
    expect(result.modified.map((f) => f.path)).toEqual(['changed.md']);
    expect(result.created.map((f) => f.path)).toEqual(['fresh.md']);
    expect(result.deleted).toEqual(['gone.md']);
    expect(result.scanned).toBe(3);
  });

  it('флаг dirty делает файл изменённым даже при совпадении mtime и размера', () => {
    const result = scanConnection([file('a.md')], [entry('a.md', { dirty: true })], options);
    expect(result.modified.map((f) => f.path)).toEqual(['a.md']);
  });

  it('файл сверх лимита попадает в пропущенные и не считается удалённым', () => {
    const result = scanConnection([file('big.bin', 5_000)], [entry('big.bin')], options);
    expect(result.skipped).toEqual([{ path: 'big.bin', size: 5_000, reason: 'too-large' }]);
    expect(result.deleted).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it('исключённый маской файл не считается удалённым', () => {
    const result = scanConnection([file('draft/a.md')], [entry('draft/a.md')], {
      ...options,
      exclude: ['draft/**'],
    });
    expect(result.skipped[0]).toMatchObject({ path: 'draft/a.md', reason: 'excluded' });
    expect(result.deleted).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  it('пути считаются от корня подключения, файлы вне папки не видны', () => {
    const result = scanConnection(
      [file('team/a.md'), file('personal/b.md'), file('team/.obsidian/app.json')],
      [],
      { ...options, folder: 'team' },
    );
    expect(result.created.map((f) => f.path)).toEqual(['a.md']);
    expect(result.scanned).toBe(1);
  });
});
