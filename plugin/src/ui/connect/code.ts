import { CONNECTION_CODE_PREFIX, connectionCodePayloadSchema } from '@vaultwire/shared';
import type { ConnectionCodePayload } from '@vaultwire/shared';
import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from '../../crypto';

/**
 * Код подключения vw1:<base64url> из раздела 1. Разбор отделён от интерфейса:
 * человеку нужно назвать причину, по которой код не принят, а не «неверный код».
 */
export const CODE_ERRORS = ['empty', 'prefix', 'base64', 'json', 'shape'] as const;
export type CodeError = (typeof CODE_ERRORS)[number];

export type CodeParseResult =
  | { readonly ok: true; readonly payload: ConnectionCodePayload }
  | { readonly ok: false; readonly error: CodeError };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function parseConnectionCode(raw: string): CodeParseResult {
  // Код приходит письмом или сообщением: переносы строк и пробелы в него не входят.
  const text = raw.replace(/\s+/gu, '');
  if (text.length === 0) return { ok: false, error: 'empty' };
  if (!text.startsWith(CONNECTION_CODE_PREFIX)) return { ok: false, error: 'prefix' };

  const body = text.slice(CONNECTION_CODE_PREFIX.length);
  if (body.length === 0 || !BASE64URL.test(body)) return { ok: false, error: 'base64' };

  let json: string;
  try {
    json = utf8Decode(fromBase64Url(body));
  } catch {
    return { ok: false, error: 'base64' };
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'json' };
  }

  const parsed = connectionCodePayloadSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'shape' };
  return { ok: true, payload: parsed.data };
}

/** Обратная сборка: владелец выдаёт код, тот же формат читает разбор выше. */
export function buildConnectionCode(payload: ConnectionCodePayload): string {
  return CONNECTION_CODE_PREFIX + toBase64Url(utf8Encode(JSON.stringify(payload)));
}

/** Хост сервера для показа человеку; неразобранный URL показывается как есть. */
export function serverHost(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}
