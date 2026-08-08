import type { ProtocolErrorCode } from '@vaultwire/shared';

/** Коды сверх протокольных: сбой транспорта, сбой сервера, негодный ответ. */
export const CLIENT_ERROR_CODES = [
  'network',
  'server_error',
  'invalid_response',
  'unexpected_status',
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ApiErrorCode = ProtocolErrorCode | ClientErrorCode;

export interface ApiErrorInit {
  readonly message?: string | undefined;
  readonly status?: number | undefined;
  /** Задержка до следующей попытки из заголовка Retry-After, мс. */
  readonly retryAfterMs?: number | undefined;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

/** Базовая ошибка клиента. Реакция на код описана в таблице раздела 3 спецификации. */
export abstract class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  readonly details: Readonly<Record<string, unknown>> | null;

  protected constructor(
    code: ApiErrorCode,
    retryable: boolean,
    fallback: string,
    init: ApiErrorInit,
  ) {
    super(init.message ?? fallback);
    // Имя берём из кода: имя класса переживёт минификацию не всегда.
    this.name = code;
    this.code = code;
    this.retryable = retryable;
    this.status = init.status ?? null;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.details = init.details ?? null;
  }
}

/** 401: токен отозван или неверен. Подключение останавливается, показывается баннер. */
export class UnauthorizedError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('unauthorized', false, 'Доступ не подтверждён', init);
  }
}

/** 403: роль не позволяет операцию. Не повторять, запись в журнал. */
export class ForbiddenError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('forbidden', false, 'Роль не позволяет операцию', init);
  }
}

/** 409: рассинхрон rev. Слепой повтор запрещён, документ разрешается через конфликт. */
export class RevisionMismatchError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('revision_mismatch', false, 'Ревизия документа разошлась', init);
  }
}

/** 413: тело больше лимита. Файл пропускается с записью в панель. */
export class TooLargeError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('too_large', false, 'Превышен лимит размера', init);
  }
}

/** 429: rate limit. Откат по Retry-After. */
export class RateLimitedError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('rate_limited', true, 'Слишком много запросов', init);
  }
}

/** 507: квота пространства исчерпана. Повтор бесполезен. */
export class QuotaExceededError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('quota_exceeded', false, 'Квота пространства исчерпана', init);
  }
}

/** 400: сервер пересчитал SHA-256 тела и не сошёлся с заголовком. */
export class InvalidBlobHashError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('invalid_blob_hash', false, 'Хеш тела не сошёлся', init);
  }
}

/** 404: документа, тела или пространства нет. */
export class NotFoundError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('not_found', false, 'Ресурс не найден', init);
  }
}

/** 400: тело запроса не прошло схему сервера. Повтор с тем же телом бесполезен. */
export class BadRequestError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('bad_request', false, 'Сервер не принял запрос', init);
  }
}

/** 500 с телом протокола. Тот же откат, что и у прочих сбоев сервера. */
export class InternalError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('internal', true, 'Сбой сервера', init);
  }
}

/** 5xx: сбой сервера. Экспоненциальный откат, до пяти попыток. */
export class ServerError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('server_error', true, 'Сбой сервера', init);
  }
}

/** Транспорт не дошёл: нет сети, оборвалось соединение, отказ TLS. */
export class NetworkError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('network', true, 'Сеть недоступна', init);
  }
}

/** Ответ не разобрался или не прошёл схему протокола. Повтор ничего не изменит. */
export class InvalidResponseError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('invalid_response', false, 'Ответ сервера не соответствует протоколу', init);
  }
}

/** Статус вне таблицы раздела 3. */
export class UnexpectedStatusError extends ApiError {
  constructor(init: ApiErrorInit = {}) {
    super('unexpected_status', false, 'Неожиданный ответ сервера', init);
  }
}
