import type { HubSocket } from '#services/hub';

/** Всё, что сессия делает с сокетом ws. Явный тип нужен: типы ws в проект не тянутся. */
export interface SyncSocket extends HubSocket {
  ping(): void;
  terminate(): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'error', listener: (error: unknown) => void): void;
  on(event: 'pong' | 'close', listener: () => void): void;
}

/** ws отдаёт тело фрейма буфером, склеенным буфером или ArrayBuffer. */
export function textOf(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data.filter(Buffer.isBuffer)).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return '';
}
