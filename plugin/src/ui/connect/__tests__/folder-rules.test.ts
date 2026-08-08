import type { SpaceId } from '@vaultwire/shared';
import { describe, expect, it } from 'vitest';
import { isSaneFolder, validateFolderChoice } from '../folder-rules';
import type { ExistingConnection } from '../folder-rules';

const SPACE = 'space-1' as SpaceId;
const OTHER = 'space-2' as SpaceId;

function existing(folder: string, spaceId: SpaceId = OTHER): ExistingConnection[] {
  return [{ spaceId, localFolder: folder }];
}

describe('validateFolderChoice', () => {
  it('пустое хранилище: любая папка и корень годятся', () => {
    expect(validateFolderChoice({ folder: 'Команда', spaceId: SPACE, existing: [] })).toBeNull();
    expect(validateFolderChoice({ folder: '', spaceId: SPACE, existing: [] })).toBeNull();
  });

  it('одно пространство подключается один раз', () => {
    const choice = { folder: 'Другая', spaceId: SPACE, existing: existing('Команда', SPACE) };
    expect(validateFolderChoice(choice)).toBe('duplicate');
  });

  it('вложенность в обе стороны запрещена', () => {
    expect(
      validateFolderChoice({ folder: 'Команда/Заметки', spaceId: SPACE, existing: existing('Команда') }),
    ).toBe('nested');
    expect(
      validateFolderChoice({ folder: 'Команда', spaceId: SPACE, existing: existing('Команда/Заметки') }),
    ).toBe('nested');
    expect(validateFolderChoice({ folder: 'Команда', spaceId: SPACE, existing: existing('Команда') })).toBe(
      'nested',
    );
  });

  it('корень занят другим подключением', () => {
    expect(validateFolderChoice({ folder: 'Команда', spaceId: SPACE, existing: existing('') })).toBe(
      'nested',
    );
    expect(validateFolderChoice({ folder: '', spaceId: SPACE, existing: existing('Команда') })).toBe(
      'nested',
    );
  });

  it('соседние папки не мешают друг другу', () => {
    expect(
      validateFolderChoice({ folder: 'Команда2', spaceId: SPACE, existing: existing('Команда') }),
    ).toBeNull();
  });

  it('служебные папки Obsidian запрещены', () => {
    expect(validateFolderChoice({ folder: '.obsidian', spaceId: SPACE, existing: [] })).toBe('reserved');
    expect(validateFolderChoice({ folder: '.trash/старое', spaceId: SPACE, existing: [] })).toBe(
      'reserved',
    );
  });

  it('выход за пределы хранилища и буква диска отбиваются', () => {
    expect(validateFolderChoice({ folder: '../снаружи', spaceId: SPACE, existing: [] })).toBe('invalid');
    expect(validateFolderChoice({ folder: 'C:/Заметки', spaceId: SPACE, existing: [] })).toBe('invalid');
  });

  it('обратные слэши и ведущий слэш нормализуются, а не отбиваются', () => {
    expect(
      validateFolderChoice({ folder: '/Команда\\Заметки/', spaceId: SPACE, existing: [] }),
    ).toBeNull();
  });
});

describe('isSaneFolder', () => {
  it('корень допустим, «..» и диск — нет', () => {
    expect(isSaneFolder('')).toBe(true);
    expect(isSaneFolder('a/b/c')).toBe(true);
    expect(isSaneFolder('a/../b')).toBe(false);
    expect(isSaneFolder('D:\\Заметки')).toBe(false);
  });
});
