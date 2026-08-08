import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { ConnectionSettings } from '../settings/types';
import type { SyncManager } from '../sync';
import { UnlockModal } from './unlock';

/** Подключение, которому нужно окно, и причина, по которой оно там оказалось. */
export interface PendingUnlock {
  readonly connection: ConnectionSettings;
  /** Сохранённый пароль не подошёл и стёрт: окно объяснит это человеку. */
  readonly stale: boolean;
}

export interface UnlockChainDeps {
  readonly app: App;
  readonly manager: SyncManager;
  save(): Promise<void>;
  onDone(): void;
}

/** Обычная очередь: пароля просто нет и никто его не терял. */
export function pendingUnlocks(connections: readonly ConnectionSettings[]): PendingUnlock[] {
  return connections.map((connection) => ({ connection, stale: false }));
}

/**
 * Цепочка разблокировки: окна идут по одному. Отмена обрывает цепочку целиком —
 * навязывать ввод пароля на старте нельзя, работа в хранилище не блокируется.
 */
export function unlockChain(deps: UnlockChainDeps, queue: readonly PendingUnlock[]): void {
  const [first, ...rest] = queue;
  if (first === undefined) return;
  new UnlockModal({
    app: deps.app,
    manager: deps.manager,
    connection: first.connection,
    notice: first.stale ? t('unlock.stale') : undefined,
    save: () => deps.save(),
    onDone: () => {
      deps.onDone();
      unlockChain(deps, rest);
    },
  }).open();
}
