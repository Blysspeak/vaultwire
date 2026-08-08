import { describe, expect, it } from 'vitest';
import { mergeMarkdown } from '../merge';
import type { MergeInput } from '../merge';

const base = ['# Заголовок', '', 'Первый абзац.', '', 'Второй абзац.'].join('\n');

function input(overrides: Partial<MergeInput> = {}): MergeInput {
  return {
    path: 'Заметка.md',
    base,
    local: base,
    remote: base,
    localFrontmatterEnd: 0,
    ...overrides,
  };
}

describe('успешное слияние', () => {
  it('непересекающиеся правки сторон сливаются', () => {
    const local = ['# Заголовок', '', 'Первый абзац, дополненный.', '', 'Второй абзац.'].join('\n');
    const remote = ['# Заголовок', '', 'Первый абзац.', '', 'Второй абзац.', '', 'Третий.'].join('\n');
    const result = mergeMarkdown(input({ local, remote }));
    expect(result).toEqual({
      ok: true,
      text: ['# Заголовок', '', 'Первый абзац, дополненный.', '', 'Второй абзац.', '', 'Третий.'].join('\n'),
    });
  });

  it('одинаковая правка с обеих сторон применяется однажды', () => {
    const both = `${base}\n\nОбщий хвост.`;
    expect(mergeMarkdown(input({ local: both, remote: both }))).toEqual({ ok: true, text: both });
  });

  it('правка одной строки с двух сторон по-разному не сливается', () => {
    const local = base.replace('Первый абзац.', 'Мой абзац.');
    const remote = base.replace('Первый абзац.', 'Их абзац.');
    expect(mergeMarkdown(input({ local, remote }))).toEqual({ ok: false, refusal: 'overlap' });
  });
});

describe('жёсткие отказы', () => {
  it('бинарные файлы всегда идут в конфликтную копию', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    expect(mergeMarkdown(input({ path: 'Схема.png', local: buffer }))).toEqual({
      ok: false,
      refusal: 'not-markdown',
    });
    expect(mergeMarkdown(input({ local: buffer }))).toEqual({ ok: false, refusal: 'binary' });
  });

  it('нулевой байт внутри текста считается признаком двоичного файла', () => {
    expect(mergeMarkdown(input({ local: `${base}\u0000` }))).toEqual({ ok: false, refusal: 'binary' });
  });

  it('правка frontmatter отменяет автослияние', () => {
    const withMatter = ['---', 'tags: [a]', '---', '', 'Текст.'].join('\n');
    const local = ['---', 'tags: [a, b]', '---', '', 'Текст.'].join('\n');
    const remote = ['---', 'tags: [a]', '---', '', 'Текст.', '', 'Хвост.'].join('\n');
    expect(
      mergeMarkdown({
        path: 'Заметка.md',
        base: withMatter,
        local,
        remote,
        localFrontmatterEnd: 3,
      }),
    ).toEqual({ ok: false, refusal: 'frontmatter' });
  });

  it('правки ниже frontmatter сливаются как обычно', () => {
    const withMatter = ['---', 'tags: [a]', '---', '', 'Текст.', '', 'Конец.'].join('\n');
    const local = withMatter.replace('Текст.', 'Мой текст.');
    const remote = withMatter.replace('Конец.', 'Их конец.');
    const result = mergeMarkdown({
      path: 'Заметка.md',
      base: withMatter,
      local,
      remote,
      localFrontmatterEnd: 3,
    });
    expect(result).toEqual({
      ok: true,
      text: ['---', 'tags: [a]', '---', '', 'Мой текст.', '', 'Их конец.'].join('\n'),
    });
  });

  it('область frontmatter берётся из metadataCache, даже когда разбор текста её не видит', () => {
    const plain = ['ключ: значение', 'Текст.', '', 'Конец.'].join('\n');
    const local = plain.replace('ключ: значение', 'ключ: другое');
    const remote = plain.replace('Конец.', 'Их конец.');
    // Разделителей «---» в тексте нет, область знает только Obsidian.
    expect(mergeMarkdown({ path: 'Заметка.md', base: plain, local, remote, localFrontmatterEnd: 1 })).toEqual(
      { ok: false, refusal: 'frontmatter' },
    );
    expect(
      mergeMarkdown({ path: 'Заметка.md', base: plain, local, remote, localFrontmatterEnd: 0 }).ok,
    ).toBe(true);
  });

  it('без базовой ревизии сливать не от чего', () => {
    expect(mergeMarkdown(input({ base: null }))).toEqual({ ok: false, refusal: 'no-base' });
  });
});
