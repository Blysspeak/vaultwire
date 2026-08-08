import type { SpaceId } from '@vaultwire/shared';
import type { HistoryDeps } from '../history/types';
import type { ConnectionRuntime, SyncManager } from '../sync';

/**
 * История, корзина и автослияние ходят на сервер одним и тем же набором:
 * клиент подключения, пространство и ключи. Без ключей (пароль не введён)
 * ничего расшифровать нельзя, поэтому набора просто нет.
 */
export function historyDeps(runtime: ConnectionRuntime): HistoryDeps | null {
  const keys = runtime.connection.keys;
  if (keys === null) return null;
  return { client: runtime.connection.client, spaceId: runtime.connection.spaceId, keys };
}

export function historyDepsOf(manager: SyncManager, spaceId: SpaceId): HistoryDeps | null {
  const runtime = manager.get(spaceId);
  return runtime === undefined ? null : historyDeps(runtime);
}
