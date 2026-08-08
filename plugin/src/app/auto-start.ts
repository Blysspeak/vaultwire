import type { SpaceId } from '@vaultwire/shared';
import { forgetPassword } from '../settings/remember';
import type { ConnectionSettings } from '../settings/types';
import type { BootstrapResult } from '../sync';
import type { PendingUnlock } from './unlock-chain';

/** Часть реестра, нужная автостарту: тест подставляет двойник, а не весь движок. */
export interface AutoStartManager {
  connection(spaceId: SpaceId): { readonly keys: unknown } | undefined;
  start(spaceId: SpaceId, password: string): Promise<BootstrapResult>;
}

/** Подключения без ключей: пароль не выведен, прогон невозможен. */
export function lockedConnections(
  manager: AutoStartManager,
  connections: readonly ConnectionSettings[],
): ConnectionSettings[] {
  return connections.filter((item) => {
    const connection = manager.connection(item.spaceId);
    return connection === undefined || connection.keys === null;
  });
}

/**
 * Подъём подключений с сохранённым паролем: окно открывается только там, где
 * пароля нет. Не подошедший пароль стирается — пространство он больше не
 * откроет, и лежать в настройках ему незачем. Сбой сети паролю не приговор:
 * подключение остаётся с ним и догонит сервер следующим прогоном.
 */
export async function autoStart(
  manager: AutoStartManager,
  connections: readonly ConnectionSettings[],
  save: () => Promise<void>,
): Promise<PendingUnlock[]> {
  const queue: PendingUnlock[] = [];
  let forgotten = false;
  for (const connection of lockedConnections(manager, connections)) {
    const password = connection.password;
    if (!connection.rememberPassword || password === null) {
      queue.push({ connection, stale: false });
      continue;
    }
    const result = await manager.start(connection.spaceId, password);
    if (result.ok || result.failure !== 'password') continue;
    forgetPassword(connection);
    forgotten = true;
    queue.push({ connection, stale: true });
  }
  if (forgotten) await save();
  return queue;
}
