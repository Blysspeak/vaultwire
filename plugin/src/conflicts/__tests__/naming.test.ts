import { describe, expect, it } from 'vitest';
import { conflictCopyPath, formatConflictStamp, isConflictCopy, sanitizeLabel } from '../naming';

const at = new Date(2026, 7, 8, 14, 30);
const never = (): boolean => false;

describe('имя конфликтной копии', () => {
  it('собирается по образцу из спецификации', () => {
    expect(conflictCopyPath('Заметка.md', 'ноутбук', at, never)).toBe(
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30).md',
    );
  });

  it('остаётся в той же папке и сохраняет расширение', () => {
    expect(conflictCopyPath('Проекты/План.canvas', 'телефон', at, never)).toBe(
      'Проекты/План (конфликт, телефон, 2026-08-08 14-30).canvas',
    );
  });

  it('файл без расширения не получает лишней точки', () => {
    expect(conflictCopyPath('README', 'ноутбук', at, never)).toBe(
      'README (конфликт, ноутбук, 2026-08-08 14-30)',
    );
  });

  it('метка устройства чистится от опасных для файловой системы символов', () => {
    expect(sanitizeLabel('Мак/Про: рабочий (дом)')).toBe('Мак Про рабочий дом');
    expect(sanitizeLabel('   ')).toBe('устройство');
  });

  it('время без двоеточий: они запрещены в именах файлов', () => {
    expect(formatConflictStamp(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02 03-04');
  });
});

describe('дедупликация имени', () => {
  it('совпадение с занятым именем разрешается номером', () => {
    const taken = new Set(['Заметка (конфликт, ноутбук, 2026-08-08 14-30).md']);
    expect(conflictCopyPath('Заметка.md', 'ноутбук', at, (path) => taken.has(path))).toBe(
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30, 2).md',
    );
  });

  it('номер растёт, пока имя не окажется свободным', () => {
    const taken = new Set([
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30).md',
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30, 2).md',
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30, 3).md',
    ]);
    expect(conflictCopyPath('Заметка.md', 'ноутбук', at, (path) => taken.has(path))).toBe(
      'Заметка (конфликт, ноутбук, 2026-08-08 14-30, 4).md',
    );
  });
});

describe('распознавание копии', () => {
  it('находит свои и чужие копии, включая пронумерованные', () => {
    expect(isConflictCopy('Заметка (конфликт, ноутбук, 2026-08-08 14-30).md')).toBe(true);
    expect(isConflictCopy('Папка/Заметка (конфликт, iPhone, 2026-08-08 14-30, 2).md')).toBe(true);
  });

  it('не трогает обычные файлы со скобками', () => {
    expect(isConflictCopy('Заметка.md')).toBe(false);
    expect(isConflictCopy('Заметка (черновик).md')).toBe(false);
    expect(isConflictCopy('Заметка (конфликт).md')).toBe(false);
  });
});
