import type { RingLog } from './log';
import type { VaultwireSettings } from './settings/types';

/**
 * Отчёт для поддержки: журнал, состояние подключений, версии.
 * Токены, пароли и содержимое заметок сюда не попадают (раздел 9).
 */
export function buildDiagnostics(
  settings: VaultwireSettings,
  log: RingLog,
  meta: Readonly<{ pluginVersion: string; appVersion: string; mobile: boolean }>,
): string {
  const head = [
    `vaultwire ${meta.pluginVersion}`,
    `obsidian ${meta.appVersion}`,
    `mobile ${String(meta.mobile)}`,
    `limits maxFileBytes=${settings.maxFileBytes} concurrency=${settings.concurrency} pollMs=${settings.pollIntervalMs}`,
    `connections ${settings.connections.length}`,
  ];
  const connections = settings.connections.map((connection, index) =>
    [
      `#${index + 1}`,
      `space=${connection.spaceId}`,
      `host=${hostOf(connection.serverUrl)}`,
      `role=${connection.role}`,
      `epoch=${connection.keyEpoch}`,
      `seq=${connection.lastSeq}`,
      `syncedAt=${connection.lastSyncedAt ?? 'never'}`,
      `autoSync=${String(connection.autoSync)}`,
      `strategy=${connection.conflictStrategy}`,
    ].join(' '),
  );
  return [...head, ...connections, '--- log ---', log.format()].join('\n');
}

function hostOf(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return 'invalid-url';
  }
}
