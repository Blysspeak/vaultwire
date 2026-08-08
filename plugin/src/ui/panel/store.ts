import type { ConnectionStatus, SyncStatus } from '../../sync/status';

export type StatusListener = (status: SyncStatus) => void;

/**
 * Источник агрегированного состояния для панели и строки состояния. Рассылка
 * идёт только при изменении: события хранилища сыплются пачками, и перерисовка
 * на каждое из них съедала бы кадр без всякой пользы.
 */
export class StatusStore {
  private current: SyncStatus;
  private readonly listeners = new Set<StatusListener>();

  constructor(private readonly read: () => SyncStatus) {
    this.current = read();
  }

  get status(): SyncStatus {
    return this.current;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Разослать текущее состояние принудительно: настройки плагина в SyncStatus не
   * попадают, а панель показывает и их — например доступность создания пространства.
   */
  notify(): void {
    this.current = this.read();
    for (const listener of this.listeners) listener(this.current);
  }

  /** Пересчитать состояние и разослать подписчикам, если оно сдвинулось. */
  publish(): void {
    const next = this.read();
    if (sameStatus(this.current, next)) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }
}

export function sameStatus(a: SyncStatus, b: SyncStatus): boolean {
  return (
    a.state === b.state &&
    a.pending === b.pending &&
    a.conflicts === b.conflicts &&
    a.problems === b.problems &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.connections.length === b.connections.length &&
    a.connections.every((item, i) => sameConnection(item, b.connections[i]))
  );
}

function sameConnection(a: ConnectionStatus, b: ConnectionStatus | undefined): boolean {
  if (b === undefined) return false;
  return (
    a.spaceId === b.spaceId &&
    a.label === b.label &&
    a.state === b.state &&
    a.role === b.role &&
    a.pending === b.pending &&
    a.conflicts === b.conflicts &&
    a.problems === b.problems &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.awaitingConfirmation === b.awaitingConfirmation
  );
}
