import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ForbiddenError,
  InternalError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  RevisionMismatchError,
  ServerError,
  TooLargeError,
  UnauthorizedError,
  UnexpectedStatusError,
} from '../errors';
import { errorFromResponse, errorFromThrown } from '../http-errors';
import { parseRetryAfter } from '../retry-after';

describe('разбор статусов в типизированные ошибки', () => {
  const cases = [
    [401, UnauthorizedError, 'unauthorized', false],
    [403, ForbiddenError, 'forbidden', false],
    [404, NotFoundError, 'not_found', false],
    [409, RevisionMismatchError, 'revision_mismatch', false],
    [413, TooLargeError, 'too_large', false],
    [429, RateLimitedError, 'rate_limited', true],
    [507, QuotaExceededError, 'quota_exceeded', false],
    [500, ServerError, 'server_error', true],
    [503, ServerError, 'server_error', true],
    [418, UnexpectedStatusError, 'unexpected_status', false],
  ] as const;

  for (const [status, ctor, code, retryable] of cases) {
    it(`статус ${status} даёт код ${code}`, () => {
      const error = errorFromResponse(status, {}, '');
      expect(error).toBeInstanceOf(ctor);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(error.status).toBe(status);
    });
  }

  it('код протокола в теле главнее статуса', () => {
    const body = JSON.stringify({ code: 'revision_mismatch', message: 'ревизия разошлась' });
    const error = errorFromResponse(400, {}, body);
    expect(error).toBeInstanceOf(RevisionMismatchError);
    expect(error.message).toBe('ревизия разошлась');
    expect(error.retryable).toBe(false);
  });

  it('тело сервера с bad_request разбирается, а не превращается в негодный ответ', () => {
    const body = JSON.stringify({ code: 'bad_request', message: 'некорректные данные: тело' });
    const error = errorFromResponse(400, {}, body);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.retryable).toBe(false);
  });

  it('внутренний сбой сервера повторяем', () => {
    const body = JSON.stringify({ code: 'internal', message: 'внутренняя ошибка сервера' });
    const error = errorFromResponse(500, {}, body);
    expect(error).toBeInstanceOf(InternalError);
    expect(error.retryable).toBe(true);
  });

  it('чужое тело не мешает разбору по статусу', () => {
    const error = errorFromResponse(503, {}, '<html>502 bad gateway</html>');
    expect(error).toBeInstanceOf(ServerError);
    expect(error.retryable).toBe(true);
  });

  it('детали ошибки протокола сохраняются', () => {
    const body = JSON.stringify({ code: 'too_large', message: 'слишком большое', details: { limit: 10 } });
    const error = errorFromResponse(413, {}, body);
    expect(error.details).toEqual({ limit: 10 });
  });

  it('отказ транспорта становится сетевой ошибкой с правом на повтор', () => {
    const error = errorFromThrown(new Error('net::ERR_CONNECTION_RESET'));
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.retryable).toBe(true);
    expect(error.status).toBeNull();
  });
});

describe('Retry-After', () => {
  it('секунды переводятся в миллисекунды', () => {
    expect(parseRetryAfter('7')).toBe(7000);
  });

  it('HTTP-дата считается от текущего момента', () => {
    const now = Date.parse('2026-08-08T12:00:00Z');
    expect(parseRetryAfter('Sat, 08 Aug 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('дата в прошлом не даёт отрицательного ожидания', () => {
    const now = Date.parse('2026-08-08T12:01:00Z');
    expect(parseRetryAfter('Sat, 08 Aug 2026 12:00:00 GMT', now)).toBe(0);
  });

  it('мусор и отсутствие заголовка дают null', () => {
    expect(parseRetryAfter('позже')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
  });

  it('заголовок читается независимо от регистра', () => {
    const error = errorFromResponse(429, { 'Retry-After': '2' }, '');
    expect(error.retryAfterMs).toBe(2000);
  });
});
