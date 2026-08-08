import { ApiError } from './errors';

export interface RetryOptions {
  /** Первая попытка входит в счёт: пять попыток это одна отправка и четыре повтора. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Доля случайного разброса задержки, 0 — детерминированно. */
  readonly jitter: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
  readonly onRetry?: (error: ApiError, delayMs: number, attempt: number) => void;
}

/** Пределы из разделов 3 и 6 спецификации: максимум пять попыток. */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.25,
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** Экспоненциальный откат со срезом разброса вниз: 500, 1000, 2000, 4000 мс. */
export function backoffDelayMs(attempt: number, options: RetryOptions): number {
  const raw = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  const factor = 1 - options.jitter + options.jitter * options.random();
  return Math.round(raw * factor);
}

/**
 * Повтор только для сетевых сбоев, 5xx и 429: флаг retryable выставлен в классе ошибки.
 * Для 409 повтор запрещён спецификацией, поэтому RevisionMismatchError сюда не попадает.
 * Retry-After сервера имеет приоритет над собственным откатом и не срезается maxDelayMs.
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  overrides: Partial<RetryOptions> = {},
): Promise<T> {
  const options: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...overrides };
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable || attempt >= options.maxAttempts) {
        throw error;
      }
      const delayMs = error.retryAfterMs ?? backoffDelayMs(attempt, options);
      options.onRetry?.(error, delayMs, attempt);
      await options.sleep(delayMs);
    }
  }
}
