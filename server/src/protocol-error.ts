import { PROTOCOL_ERROR_STATUS, type ProtocolErrorBody, type ProtocolErrorCode } from '@vaultwire/shared';

/** Ошибка, которую бросают роуты. Обработчик приложения превращает её в тело ответа. */
export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ProtocolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    this.status = PROTOCOL_ERROR_STATUS[code];
    this.details = details;
  }

  toBody(): ProtocolErrorBody {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

/** Статус ответа Fastify, если ошибка его несёт. */
function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'внутренняя ошибка сервера';
}

const STATUS_TO_CODE: Record<number, ProtocolErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'revision_mismatch',
  413: 'too_large',
  429: 'rate_limited',
  507: 'quota_exceeded',
};

/**
 * Любая ошибка приводится к ProtocolError, чтобы наружу шло одно тело.
 *
 * Отдельной ветки на ошибку схемы здесь нет намеренно. Входящие тела разбирает
 * parseOrFail и сам бросает bad_request, а схемы на исходящих данных срабатывают
 * только при расхождении с базой: это внутренний сбой, а не вина клиента.
 */
export function normalizeError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;

  const status = statusOf(error);
  const mapped = status === null ? undefined : STATUS_TO_CODE[status];
  if (mapped !== undefined) {
    return new ProtocolError(mapped, messageOf(error));
  }

  return new ProtocolError('internal', 'внутренняя ошибка сервера');
}
