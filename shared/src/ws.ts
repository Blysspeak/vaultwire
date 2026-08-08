import { z } from 'zod';
import { PROTOCOL_VERSION, spaceIdSchema } from './protocol.js';
import { seqSchema } from './schemas/common.js';

/** Путь WebSocket-эндпоинта. */
export const WS_PATH = '/v1/sync';

/** Heartbeat: интервал отправки и порог тишины, после которого переподключаемся. */
export const WS_HEARTBEAT_INTERVAL_MS = 30_000;
export const WS_HEARTBEAT_TIMEOUT_MS = 60_000;

/** Первый фрейм клиента. Токен идёт телом, не в query, чтобы не оседать в логах nginx. */
export const wsAuthFrameSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
  spaceId: spaceIdSchema,
  protocolVersion: z.literal(PROTOCOL_VERSION),
});
export type WsAuthFrame = z.infer<typeof wsAuthFrameSchema>;

/** Прикладной ping: WebSocket в Obsidian браузерный и служебные ping-фреймы слать не умеет. */
export const wsPingFrameSchema = z.object({ type: z.literal('ping') });
export type WsPingFrame = z.infer<typeof wsPingFrameSchema>;

export const wsClientFrameSchema = z.discriminatedUnion('type', [wsAuthFrameSchema, wsPingFrameSchema]);
export type WsClientFrame = z.infer<typeof wsClientFrameSchema>;

/** Звоночек об изменении: шлётся после коммита транзакции всем, кроме автора. Данные тянутся по HTTP. */
export const wsChangedFrameSchema = z.object({
  type: z.literal('changed'),
  spaceId: spaceIdSchema,
  seq: seqSchema,
});
export type WsChangedFrame = z.infer<typeof wsChangedFrameSchema>;

export const wsPongFrameSchema = z.object({ type: z.literal('pong') });
export type WsPongFrame = z.infer<typeof wsPongFrameSchema>;

export const wsServerFrameSchema = z.discriminatedUnion('type', [wsChangedFrameSchema, wsPongFrameSchema]);
export type WsServerFrame = z.infer<typeof wsServerFrameSchema>;
