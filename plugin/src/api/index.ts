export {
  ApiError,
  BadRequestError,
  CLIENT_ERROR_CODES,
  ForbiddenError,
  InternalError,
  InvalidBlobHashError,
  InvalidResponseError,
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
export type { ApiErrorCode, ApiErrorInit, ClientErrorCode } from './errors';
export { parseRetryAfter } from './retry-after';

export { errorFromResponse, errorFromThrown } from './http-errors';

export { DEFAULT_RETRY_OPTIONS, backoffDelayMs, withRetry } from './retry';
export type { RetryOptions } from './retry';

export { HttpClient } from './http';
export type {
  HttpClientOptions,
  HttpMethod,
  HttpRequest,
  HttpResult,
  RequestFn,
  ResponseSchema,
} from './http';

export { VaultwireClient, createClient } from './client';
export { obsidianRequest } from './request';

export { SYNC_SOCKET_STATES, SyncSocket, toWebSocketUrl } from './ws';
export type { SyncSocketOptions, SyncSocketState } from './ws';
