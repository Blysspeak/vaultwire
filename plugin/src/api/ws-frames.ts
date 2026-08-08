import { wsServerFrameSchema } from '@vaultwire/shared';
import type { WsServerFrame } from '@vaultwire/shared';

/**
 * Разбор фрейма сервера. Всё, что не прошло схему протокола, игнорируется молча:
 * канал общий, ронять синхронизацию из-за неизвестного фрейма нельзя.
 */
export function parseServerFrame(data: unknown): WsServerFrame | null {
  if (typeof data !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = wsServerFrameSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
