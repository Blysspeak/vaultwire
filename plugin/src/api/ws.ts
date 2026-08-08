import {
  PROTOCOL_VERSION,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_HEARTBEAT_TIMEOUT_MS,
  WS_PATH,
} from '@vaultwire/shared';
import type { SpaceId, WsChangedFrame, WsClientFrame } from '@vaultwire/shared';
import { DEFAULT_RETRY_OPTIONS, backoffDelayMs } from './retry';
import type { RetryOptions } from './retry';
import { parseServerFrame } from './ws-frames';

export const SYNC_SOCKET_STATES = ['closed', 'connecting', 'open'] as const;
export type SyncSocketState = (typeof SYNC_SOCKET_STATES)[number];

export interface SyncSocketOptions {
  readonly baseUrl: string;
  readonly spaceId: SpaceId;
  readonly token: string;
  /** Звоночек об изменении. Данные всегда тянутся по HTTP, здесь только seq. */
  readonly onChanged: (frame: WsChangedFrame) => void;
  readonly onState?: (state: SyncSocketState, reason: string | null) => void;
  readonly createSocket?: (url: string) => WebSocket;
  readonly now?: () => number;
}

/** Откат переподключения: от секунды до минуты, отдельно от отката HTTP-запросов. */
const RECONNECT: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, baseDelayMs: 1000, maxDelayMs: 60_000 };

/**
 * WebSocket раздела 4: токен уходит первым фреймом, а не в query.
 * Соединение не поднялось — синхронизация живёт на интервальном опросе changes.
 */
export class SyncSocket {
  private readonly url: string;
  private readonly now: () => number;
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private attempt = 0;
  private stopped = true;
  private currentState: SyncSocketState = 'closed';

  constructor(private readonly options: SyncSocketOptions) {
    this.url = toWebSocketUrl(options.baseUrl);
    this.now = options.now ?? Date.now;
  }

  get state(): SyncSocketState {
    return this.currentState;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  /** Корректное закрытие при выгрузке плагина: таймеры сняты, сокет закрыт штатным кодом. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.dropSocket(1000);
    this.setState('closed', null);
  }

  private connect(): void {
    this.setState('connecting', null);
    const create = this.options.createSocket ?? ((url: string): WebSocket => new WebSocket(url));
    const socket = create(this.url);
    this.socket = socket;
    socket.onopen = (): void => this.onOpen();
    socket.onmessage = (event: MessageEvent<unknown>): void => this.onMessage(event.data);
    socket.onerror = (): void => this.fail('ошибка соединения');
    socket.onclose = (): void => this.fail('соединение закрыто');
  }

  private onOpen(): void {
    this.attempt = 0;
    this.lastMessageAt = this.now();
    this.send({
      type: 'auth',
      token: this.options.token,
      spaceId: this.options.spaceId,
      protocolVersion: PROTOCOL_VERSION,
    });
    this.heartbeat = setInterval(() => this.tick(), WS_HEARTBEAT_INTERVAL_MS);
    this.setState('open', null);
  }

  /** Тишина 60 секунд означает тихо оборванное соединение: nginx и операторы рвут молча. */
  private tick(): void {
    if (this.now() - this.lastMessageAt > WS_HEARTBEAT_TIMEOUT_MS) {
      this.fail('нет ответа 60 секунд');
      return;
    }
    this.send({ type: 'ping' });
  }

  private onMessage(data: unknown): void {
    this.lastMessageAt = this.now();
    const frame = parseServerFrame(data);
    if (frame !== null && frame.type === 'changed') this.options.onChanged(frame);
  }

  private fail(reason: string): void {
    if (this.socket === null) return;
    this.clearTimers();
    this.dropSocket(4000);
    this.setState('closed', reason);
    if (this.stopped) return;
    this.attempt += 1;
    const delayMs = backoffDelayMs(this.attempt, RECONNECT);
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  private send(frame: WsClientFrame): void {
    this.socket?.send(JSON.stringify(frame));
  }

  private dropSocket(code: number): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    socket.close(code);
  }

  private clearTimers(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.heartbeat = null;
    this.reconnectTimer = null;
  }

  private setState(state: SyncSocketState, reason: string | null): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onState?.(state, reason);
  }
}

/** https становится wss, префикс пути сервера сохраняется. */
export function toWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/+$/, '') + WS_PATH;
  return url.toString();
}
