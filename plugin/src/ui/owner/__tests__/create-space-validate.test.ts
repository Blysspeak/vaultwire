import { describe, expect, it } from 'vitest';
import type { SpaceId } from '@vaultwire/shared';
import type { ConnectionSettings } from '../../../settings/types';
import type { CreateSpaceInput } from '../create-space-run';
import { connectionLabel, failureKey, validateCreateSpace } from '../create-space-validate';

const INPUT: CreateSpaceInput = {
  serverUrl: 'https://obsidian.boostix.space',
  bootstrapToken: 'bootstrap',
  password: 'пароль',
  localFolder: 'Команда',
  deviceLabel: 'ноутбук',
  label: 'Команда',
};

function existing(folder: string): ConnectionSettings[] {
  return [{ localFolder: folder, spaceId: 'space' as SpaceId } as ConnectionSettings];
}

describe('проверки создания пространства', () => {
  it('принимает заполненную форму', () => {
    expect(validateCreateSpace(INPUT, INPUT.password, [])).toBeNull();
  });

  it('требует http-адрес сервера', () => {
    expect(validateCreateSpace({ ...INPUT, serverUrl: 'ftp://x' }, INPUT.password, [])).toBe(
      'error.serverUrl',
    );
    expect(validateCreateSpace({ ...INPUT, serverUrl: 'мусор' }, INPUT.password, [])).toBe(
      'error.serverUrl',
    );
  });

  it('не пропускает расхождение паролей и пустой пароль', () => {
    expect(validateCreateSpace(INPUT, 'другой', [])).toBe('error.passwordMismatch');
    expect(validateCreateSpace({ ...INPUT, password: '' }, '', [])).toBe('error.passwordRequired');
  });

  it('требует токен и метку устройства', () => {
    expect(validateCreateSpace({ ...INPUT, bootstrapToken: '' }, INPUT.password, [])).toBe(
      'error.tokenRequired',
    );
    expect(validateCreateSpace({ ...INPUT, deviceLabel: '' }, INPUT.password, [])).toBe(
      'error.deviceLabelRequired',
    );
  });

  it('ловит путь с выходом наверх и пересечение с чужой папкой', () => {
    expect(validateCreateSpace({ ...INPUT, localFolder: '../вне' }, INPUT.password, [])).toBe(
      'connect.folder.error.invalid',
    );
    expect(validateCreateSpace(INPUT, INPUT.password, existing('Команда/Заметки'))).toBe(
      'connect.folder.error.nested',
    );
  });
});

describe('подписи формы', () => {
  it('имя подключения берёт имя папки, для корня — общее слово', () => {
    expect(connectionLabel('Работа/Команда')).toBe('Команда');
    expect(connectionLabel('')).toBe('Пространство');
  });

  it('переводит причину отказа старта', () => {
    expect(failureKey('password')).toBe('bootstrap.password');
    expect(failureKey('transport')).toBe('bootstrap.transport');
  });
});
