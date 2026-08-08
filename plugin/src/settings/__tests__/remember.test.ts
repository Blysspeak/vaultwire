import { describe, expect, it } from 'vitest';
import { connectionSettings } from '../../sync/__tests__/doubles';
import { forgetPassword, storePassword, toggleRemember } from '../remember';

describe('хранение пароля подключения', () => {
  it('включённый переключатель кладёт пароль в настройки', () => {
    const connection = connectionSettings({ rememberPassword: true, password: null });

    storePassword(connection, 'пароль', true);

    expect(connection.password).toBe('пароль');
    expect(connection.rememberPassword).toBe(true);
  });

  it('выключенный переключатель пароль не сохраняет', () => {
    const connection = connectionSettings({ rememberPassword: true, password: 'старый' });

    storePassword(connection, 'пароль', false);

    expect(connection.password).toBeNull();
    expect(connection.rememberPassword).toBe(false);
  });

  it('забывание чистит и пароль, и флаг', () => {
    const connection = connectionSettings({ rememberPassword: true, password: 'пароль' });

    forgetPassword(connection);

    expect(connection.password).toBeNull();
    expect(connection.rememberPassword).toBe(false);
  });

  it('выключение опции стирает сохранённый пароль и пишет настройки', async () => {
    const connection = connectionSettings({ rememberPassword: true, password: 'пароль' });
    let saved = 0;
    let asked = 0;

    await toggleRemember(
      {
        connection,
        save: () => {
          saved += 1;
          return Promise.resolve();
        },
        requestPassword: () => {
          asked += 1;
        },
      },
      false,
    );

    expect(connection.password).toBeNull();
    expect(connection.rememberPassword).toBe(false);
    expect(saved).toBe(1);
    expect(asked).toBe(0);
  });

  it('включение опции просит пароль и само настройки не трогает', async () => {
    const connection = connectionSettings({ rememberPassword: false, password: null });
    let saved = 0;
    let asked = 0;

    await toggleRemember(
      {
        connection,
        save: () => {
          saved += 1;
          return Promise.resolve();
        },
        requestPassword: () => {
          asked += 1;
        },
      },
      true,
    );

    expect(asked).toBe(1);
    expect(saved).toBe(0);
    expect(connection.rememberPassword).toBe(false);
  });
});
