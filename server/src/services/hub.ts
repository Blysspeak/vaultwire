import { spaceIdSchema, type WsChangedFrame } from '@vaultwire/shared';
import { logger } from '#logger';

/**
 * Реестр живых WebSocket-соединений, сгруппированных по пространству.
 * Хаб знает о сокете ровно два действия, поэтому в тестах вместо ws идёт заглушка.
 */
export interface HubSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type Subscription = { deviceId: string; socket: HubSocket };

export class SyncHub {
  readonly #bySpace = new Map<string, Set<Subscription>>();

  /** Возвращает функцию отписки: её обязан звать обработчик close соединения. */
  subscribe(spaceId: string, deviceId: string, socket: HubSocket): () => void {
    const set = this.#bySpace.get(spaceId) ?? new Set<Subscription>();
    const subscription: Subscription = { deviceId, socket };
    set.add(subscription);
    this.#bySpace.set(spaceId, set);
    return () => {
      this.#remove(spaceId, subscription);
    };
  }

  /**
   * Звоночек об изменении. Зовётся только после коммита транзакции: до него
   * другое устройство пришло бы за данными и увидело старое состояние.
   * Автору не шлём, свой seq он уже получил ответом на запись.
   */
  broadcastChanged(spaceId: string, seq: number, exceptDeviceId: string): number {
    const set = this.#bySpace.get(spaceId);
    if (set === undefined) return 0;

    const frame: WsChangedFrame = { type: 'changed', spaceId: spaceIdSchema.parse(spaceId), seq };
    const payload = JSON.stringify(frame);
    let sent = 0;

    // Копия набора: отправка может снять соединение прямо во время обхода.
    for (const subscription of [...set]) {
      if (subscription.deviceId === exceptDeviceId) continue;
      try {
        subscription.socket.send(payload);
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, spaceId }, 'звоночек не ушёл, соединение снято');
        this.#remove(spaceId, subscription);
        subscription.socket.close();
      }
    }
    return sent;
  }

  /** Отзыв устройства: его соединения закрываются немедленно. */
  dropDevice(deviceId: string): number {
    let dropped = 0;
    for (const [spaceId, set] of this.#bySpace) {
      for (const subscription of [...set]) {
        if (subscription.deviceId !== deviceId) continue;
        this.#remove(spaceId, subscription);
        subscription.socket.close();
        dropped += 1;
      }
    }
    return dropped;
  }

  connectionsOf(spaceId: string): number {
    return this.#bySpace.get(spaceId)?.size ?? 0;
  }

  get size(): number {
    let total = 0;
    for (const set of this.#bySpace.values()) total += set.size;
    return total;
  }

  #remove(spaceId: string, subscription: Subscription): void {
    const set = this.#bySpace.get(spaceId);
    if (set === undefined) return;
    set.delete(subscription);
    // Пустые множества не копим: иначе Map растёт по числу когда-либо активных пространств.
    if (set.size === 0) this.#bySpace.delete(spaceId);
  }
}

/** Хаб приложения. Один процесс — один реестр. */
export const hub = new SyncHub();
