import type { SpaceId } from '@vaultwire/shared';
import { describe, expect, it } from 'vitest';
import { connectionSettings } from '../../sync/__tests__/doubles';
import type { BootstrapFailure, BootstrapResult } from '../../sync';
import { autoStart } from '../auto-start';
import type { AutoStartManager } from '../auto-start';

/** Реестр на подделке: подключение без ключей, старт с заданным исходом. */
function fakeManager(outcome: BootstrapFailure | null = null): AutoStartManager & {
  readonly starts: Array<{ spaceId: SpaceId; password: string }>;
} {
  const starts: Array<{ spaceId: SpaceId; password: string }> = [];
  return {
    starts,
    connection: () => ({ keys: null }),
    start: (spaceId: SpaceId, password: string): Promise<BootstrapResult> => {
      starts.push({ spaceId, password });
      return Promise.resolve({ ok: outcome === null, failure: outcome });
    },
  };
}

describe('автостарт подключений', () => {
  it('сохранённый пароль поднимает подключение без окна', async () => {
    const manager = fakeManager();
    const connection = connectionSettings({ rememberPassword: true, password: 'пароль' });

    const queue = await autoStart(manager, [connection], () => Promise.reject(new Error('лишнее')));

    expect(manager.starts).toEqual([{ spaceId: connection.spaceId, password: 'пароль' }]);
    expect(queue).toHaveLength(0);
    expect(connection.password).toBe('пароль');
  });

  it('без сохранённого пароля подключение уходит в очередь окон', async () => {
    const manager = fakeManager();
    const connection = connectionSettings({ rememberPassword: false, password: null });

    const queue = await autoStart(manager, [connection], () => Promise.reject(new Error('лишнее')));

    expect(manager.starts).toHaveLength(0);
    expect(queue).toEqual([{ connection, stale: false }]);
  });

  it('неподошедший сохранённый пароль стирается и открывает окно', async () => {
    const manager = fakeManager('password');
    const connection = connectionSettings({ rememberPassword: true, password: 'старый' });
    let saved = 0;

    const queue = await autoStart(manager, [connection], () => {
      saved += 1;
      return Promise.resolve();
    });

    expect(connection.password).toBeNull();
    expect(connection.rememberPassword).toBe(false);
    expect(saved).toBe(1);
    expect(queue).toEqual([{ connection, stale: true }]);
  });

  it('сбой сети пароль не трогает и окно не открывает', async () => {
    const manager = fakeManager('transport');
    const connection = connectionSettings({ rememberPassword: true, password: 'пароль' });

    const queue = await autoStart(manager, [connection], () => Promise.reject(new Error('лишнее')));

    expect(connection.password).toBe('пароль');
    expect(queue).toHaveLength(0);
  });

  it('подключение с уже выведенными ключами не стартует повторно', async () => {
    const manager = fakeManager();
    const unlocked: AutoStartManager = { ...manager, connection: () => ({ keys: {} }) };
    const connection = connectionSettings({ rememberPassword: true, password: 'пароль' });

    const queue = await autoStart(unlocked, [connection], () => Promise.resolve());

    expect(manager.starts).toHaveLength(0);
    expect(queue).toHaveLength(0);
  });
});
