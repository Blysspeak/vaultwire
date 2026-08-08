import { protocolErrorBodySchema } from '@vaultwire/shared';
import type { ProtocolErrorBody, ProtocolErrorCode } from '@vaultwire/shared';
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  InternalError,
  InvalidBlobHashError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  RevisionMismatchError,
  ServerError,
  TooLargeError,
  UnauthorizedError,
  UnexpectedStatusError,
} from './errors';
import type { ApiErrorInit } from './errors';
import { parseRetryAfter } from './retry-after';

type ErrorCtor = new (init: ApiErrorInit) => ApiError;

/** Код протокола главнее статуса: тело ответа точнее транспорта. */
const BY_CODE = {
  unauthorized: UnauthorizedError,
  forbidden: ForbiddenError,
  revision_mismatch: RevisionMismatchError,
  too_large: TooLargeError,
  rate_limited: RateLimitedError,
  quota_exceeded: QuotaExceededError,
  invalid_blob_hash: InvalidBlobHashError,
  not_found: NotFoundError,
  bad_request: BadRequestError,
  internal: InternalError,
} as const satisfies Record<ProtocolErrorCode, ErrorCtor>;

/** Таблица кодов раздела 3 спецификации на случай ответа без тела протокола. */
const BY_STATUS: Readonly<Record<number, ErrorCtor>> = {
  401: UnauthorizedError,
  403: ForbiddenError,
  404: NotFoundError,
  409: RevisionMismatchError,
  413: TooLargeError,
  429: RateLimitedError,
  507: QuotaExceededError,
};

/** Ответ со статусом 400 и выше в типизированную ошибку. */
export function errorFromResponse(
  status: number,
  headers: Readonly<Record<string, string>>,
  body: string,
  nowMs = Date.now(),
): ApiError {
  const parsed = parseErrorBody(body);
  const retryAfterMs = parseRetryAfter(headerValue(headers, 'retry-after'), nowMs);
  const init: ApiErrorInit = {
    status,
    message: parsed?.message,
    retryAfterMs: retryAfterMs ?? undefined,
    details: parsed?.details,
  };
  const Ctor = pickCtor(status, parsed);
  return new Ctor(init);
}

/** Отказ транспорта: до статуса дело не дошло, повторять можно. */
export function errorFromThrown(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  return new NetworkError({ message });
}

function pickCtor(status: number, parsed: ProtocolErrorBody | null): ErrorCtor {
  if (parsed !== null) return BY_CODE[parsed.code];
  const byStatus = BY_STATUS[status];
  if (byStatus !== undefined) return byStatus;
  return status >= 500 ? ServerError : UnexpectedStatusError;
}

function parseErrorBody(body: string): ProtocolErrorBody | null {
  if (body.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = protocolErrorBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Регистр имён заголовков не гарантирован ни requestUrl, ни прокси. */
function headerValue(headers: Readonly<Record<string, string>>, name: string): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}
