import type { FastifyPluginAsync } from 'fastify';
import { WS_PATH } from '@vaultwire/shared';
import { openSyncSession } from '#routes/ws-session';
import type { SyncSocket } from '#routes/ws-socket';

/**
 * WebSocket на WS_PATH из shared (/v1/sync). Регистрируется без префикса,
 * чтобы путь совпадал с константой протокола буква в букву.
 * Токен приходит первым фреймом, а не в query: query оседает в логах nginx.
 * Плагин @fastify/websocket уже подключён в app.ts, повторно его регистрировать нельзя.
 */
export const syncWsRoutes: FastifyPluginAsync = async (app) => {
  // Аннотация socket обязательна: типы ws в проект не тянутся и параметр иначе нетипизирован.
  app.get(WS_PATH, { websocket: true }, (socket: SyncSocket, request) => {
    openSyncSession(socket, request.log);
  });
};
