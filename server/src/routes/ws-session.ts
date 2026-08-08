import type { FastifyBaseLogger } from 'fastify';
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_HEARTBEAT_TIMEOUT_MS,
  wsClientFrameSchema,
  type WsAuthFrame,
  type WsPongFrame,
} from '@vaultwire/shared';
import { hashToken, type AuthenticatedDevice } from '#plugins/token-cache';
import { textOf, type SyncSocket } from '#routes/ws-socket';
import { lookupDeviceByHash } from '#services/device-auth';
import { hub } from '#services/hub';

/** Соединение без первого фрейма auth занимает сокет впустую. */
const AUTH_TIMEOUT_MS = 10_000;

/** RFC 6455: нарушение политики. Причина короткая, в кадр закрытия влезает 123 байта. */
const CLOSE_POLICY = 1008;

/**
 * Жизненный цикл одного соединения: авторизация первым фреймом, подписка на
 * пространство, heartbeat и уборка. Данные по WebSocket не ходят, только звоночки.
 */
export function openSyncSession(socket: SyncSocket, log: FastifyBaseLogger): void {
  let device: AuthenticatedDevice | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastSeenAt = Date.now();
  let closed = false;

  const finish = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(authDeadline);
    unsubscribe?.();
    unsubscribe = null;
  };

  const reject = (reason: string): void => {
    log.warn({ reason }, 'соединение WebSocket отклонено');
    finish();
    socket.close(CLOSE_POLICY, reason);
  };

  const sendPong = (): void => {
    const pong: WsPongFrame = { type: 'pong' };
    try {
      socket.send(JSON.stringify(pong));
    } catch {
      finish();
    }
  };

  const authorize = async (frame: WsAuthFrame): Promise<void> => {
    // Повторный auth ничего не меняет: подписка уже есть, второй токен не принимаем.
    if (device !== null) return;

    let authenticated: AuthenticatedDevice;
    try {
      authenticated = await lookupDeviceByHash(hashToken(frame.token));
    } catch {
      reject('token');
      return;
    }
    if (authenticated.spaceId !== frame.spaceId) {
      reject('space');
      return;
    }
    // Пока шла проверка, соединение могло закрыться: подписку тогда не создаём.
    if (closed) return;

    device = authenticated;
    clearTimeout(authDeadline);
    unsubscribe = hub.subscribe(authenticated.spaceId, authenticated.deviceId, socket);
    log.info(
      { spaceId: authenticated.spaceId, deviceId: authenticated.deviceId },
      'устройство подписано на изменения',
    );
  };

  const handleFrame = (text: string): void => {
    lastSeenAt = Date.now();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      reject('json');
      return;
    }
    const frame = wsClientFrameSchema.safeParse(payload);
    if (!frame.success) {
      reject('frame');
      return;
    }
    if (frame.data.type === 'ping') {
      sendPong();
      return;
    }
    void authorize(frame.data);
  };

  // nginx и мобильные операторы рвут простаивающие соединения тихо, поэтому пингуем сами.
  const heartbeat = setInterval(() => {
    if (Date.now() - lastSeenAt > WS_HEARTBEAT_TIMEOUT_MS) {
      log.info({ deviceId: device?.deviceId ?? null }, 'нет ответа на heartbeat, рвём соединение');
      finish();
      socket.terminate();
      return;
    }
    try {
      socket.ping();
    } catch {
      finish();
    }
  }, WS_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const authDeadline = setTimeout(() => {
    if (device === null) reject('auth timeout');
  }, AUTH_TIMEOUT_MS);
  authDeadline.unref();

  socket.on('pong', () => {
    lastSeenAt = Date.now();
  });
  socket.on('message', (data) => {
    handleFrame(textOf(data));
  });
  socket.on('close', finish);
  socket.on('error', (error) => {
    log.warn({ err: error }, 'сбой соединения WebSocket');
    finish();
  });
}
