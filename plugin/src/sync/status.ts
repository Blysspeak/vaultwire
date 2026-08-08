import type { Role, SpaceId } from '@vaultwire/shared';
import type { SyncConnection } from './connection';
import { STATE_SEVERITY } from './types';
import type { ConnectionState } from './types';

/**
 * Состояние для строки состояния и панели. Только числа и коды: строки
 * интерфейса живут в словаре i18n, сюда они не попадают.
 */
export interface ConnectionStatus {
  readonly spaceId: SpaceId;
  readonly label: string;
  readonly state: ConnectionState;
  readonly role: Role;
  /** Замечено локально и ещё не отправлено: очередь наблюдателя плюс флаги индекса. */
  readonly pending: number;
  readonly conflicts: number;
  /** Документы, исчерпавшие попытки: у них в панели кнопка повтора. */
  readonly problems: number;
  readonly lastSyncedAt: number | null;
  /** Прогон остановлен порогом массового удаления и ждёт подтверждения. */
  readonly awaitingConfirmation: boolean;
}

export interface SyncStatus {
  readonly state: ConnectionState;
  readonly connections: readonly ConnectionStatus[];
  readonly pending: number;
  readonly conflicts: number;
  readonly problems: number;
  readonly lastSyncedAt: number | null;
}

export function connectionStatus(connection: SyncConnection): ConnectionStatus {
  const report = connection.lastReport;
  const dirty = connection.index.all().filter((entry) => entry.dirty).length;
  return {
    spaceId: connection.spaceId,
    label: connection.settings.label,
    state: connection.state,
    role: connection.role,
    pending: connection.pendingCount + dirty,
    conflicts: report?.conflicts.length ?? 0,
    problems: report?.problems.length ?? 0,
    lastSyncedAt: connection.settings.lastSyncedAt,
    awaitingConfirmation: report?.massCheck !== null && report?.massCheck !== undefined,
  };
}

/** Общее состояние плагина: показывается худшее из подключений. */
export function aggregateStatus(connections: readonly SyncConnection[]): SyncStatus {
  const statuses = connections.map(connectionStatus);
  return {
    state: worstState(statuses.map((status) => status.state)),
    connections: statuses,
    pending: sum(statuses.map((status) => status.pending)),
    conflicts: sum(statuses.map((status) => status.conflicts)),
    problems: sum(statuses.map((status) => status.problems)),
    lastSyncedAt: latest(statuses.map((status) => status.lastSyncedAt)),
  };
}

export function worstState(states: readonly ConnectionState[]): ConnectionState {
  return STATE_SEVERITY.find((state) => states.includes(state)) ?? 'idle';
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function latest(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.max(...known);
}
