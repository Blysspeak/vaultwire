import type { SpaceId } from '@vaultwire/shared';
import type { ConnectionStatus, SyncStatus } from '../../sync/status';

/** Пустое состояние: подключений нет либо активное уже отключили. */
const NOTHING: SyncStatus = {
  state: 'idle',
  connections: [],
  pending: 0,
  conflicts: 0,
  problems: 0,
  lastSyncedAt: null,
};

/** Активное подключение из шапки; null — его больше нет в состоянии. */
export function pickConnection(
  status: SyncStatus,
  spaceId: SpaceId | null,
): ConnectionStatus | null {
  if (spaceId === null) return null;
  return status.connections.find((item) => item.spaceId === spaceId) ?? null;
}

/**
 * Первое подключение вместо пропавшего: список могли переставить или отключить
 * пространство, а вкладки без активного подключения показывать нечего.
 */
export function resolveActive(status: SyncStatus, current: SpaceId | null): SpaceId | null {
  if (pickConnection(status, current) !== null) return current;
  return status.connections[0]?.spaceId ?? null;
}

/**
 * Состояние одного подключения в форме SyncStatus: вкладки написаны под общий
 * тип, а показывают всегда активное подключение из шапки.
 */
export function scopeStatus(status: SyncStatus, spaceId: SpaceId | null): SyncStatus {
  const one = pickConnection(status, spaceId);
  if (one === null) return NOTHING;
  return {
    state: one.state,
    connections: [one],
    pending: one.pending,
    conflicts: one.conflicts,
    problems: one.problems,
    lastSyncedAt: one.lastSyncedAt,
  };
}
