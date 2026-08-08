import type { WsChangedFrame } from '@vaultwire/shared';
import { SyncSocket } from '../api/ws';
import type { SyncSocketState } from '../api/ws';
import type { RingLog } from '../log';
import type { SyncConnection } from './connection';
import type { RunTrigger } from './types';

export interface LiveSyncDeps {
  readonly connection: SyncConnection;
  readonly runner: RunTrigger;
  /** Период запасного опроса, мс. Меняется перезапуском подключения. */
  readonly pollIntervalMs: number;
  /** window.setInterval, обёрнутый в plugin.registerInterval: голых таймеров нет. */
  readonly registerInterval: (run: () => void, ms: number) => void;
  readonly createSocket?: (url: string) => WebSocket;
  readonly log: RingLog;
}

/**
 * Раздел 4: WebSocket служит только звоночком, данные всегда тянутся по HTTP.
 * Соединение не поднялось — работает интервальный опрос changes, поэтому
 * таймер регистрируется всегда и просто молчит, пока канал открыт.
 */
export class LiveSync {
  private socket: SyncSocket | null = null;
  private registered = false;

  constructor(private readonly deps: LiveSyncDeps) {}

  get connected(): boolean {
    return this.socket?.state === 'open';
  }

  start(): void {
    if (this.socket === null) {
      this.socket = new SyncSocket({
        baseUrl: this.deps.connection.settings.serverUrl,
        spaceId: this.deps.connection.spaceId,
        token: this.deps.connection.settings.deviceToken,
        onChanged: (frame: WsChangedFrame): void => this.onChanged(frame),
        onState: (state: SyncSocketState, reason: string | null): void => this.onState(state, reason),
        ...(this.deps.createSocket === undefined ? {} : { createSocket: this.deps.createSocket }),
      });
    }
    this.socket.start();
    if (this.registered) return;
    this.registered = true;
    this.deps.registerInterval(() => this.tick(), this.deps.pollIntervalMs);
  }

  stop(): void {
    this.socket?.stop();
    this.socket = null;
  }

  /** Запасной опрос: пока канал открыт, тик ничего не делает. */
  private tick(): void {
    const { connection } = this.deps;
    if (!connection.runnable || !connection.settings.autoSync) return;
    if (this.connected) return;
    this.deps.log.debug('sync', 'опрос изменений', { space: connection.spaceId });
    void this.deps.runner.run();
  }

  /** Звоночек: сравниваем с курсором, чтобы не гонять прогон на собственную запись. */
  private onChanged(frame: WsChangedFrame): void {
    if (frame.spaceId !== this.deps.connection.spaceId) return;
    if (frame.seq <= this.deps.connection.lastSeq) return;
    void this.deps.runner.run();
  }

  private onState(state: SyncSocketState, reason: string | null): void {
    this.deps.log.debug('sync', 'состояние канала', {
      space: this.deps.connection.spaceId,
      state,
      ...(reason === null ? {} : { reason }),
    });
  }
}
