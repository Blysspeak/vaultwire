import { describe, expect, it } from 'vitest';
import { docWriteResultSchema } from '@vaultwire/shared';
import { HttpClient } from '../http';
import { ForbiddenError, RevisionMismatchError, ServerError } from '../errors';
import { withRetry } from '../retry';
import { fakeRequest, recordingSleep } from './fake-request';
import type { FakeReply } from './fake-request';

const OK = JSON.stringify({ rev: 2, seq: 5 });

function run(replies: readonly FakeReply[]) {
  const request = fakeRequest(replies);
  const timer = recordingSleep();
  const http = new HttpClient({
    baseUrl: 'https://obsidian.boostix.space',
    token: 't',
    request: request.fn,
    // random = 1 снимает разброс: задержки проверяются точно.
    retry: { sleep: timer.sleep, random: () => 1 },
  });
  const promise = http.json({ method: 'PUT', path: '/v1/spaces/s1/docs/d1' }, docWriteResultSchema);
  return { promise, calls: request.calls, delays: timer.delays };
}

describe('политика повторов', () => {
  it('409 не повторяется никогда', async () => {
    const { promise, calls, delays } = run([{ status: 409 }, { status: 200, body: OK }]);
    await expect(promise).rejects.toBeInstanceOf(RevisionMismatchError);
    expect(calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('403 не повторяется', async () => {
    const { promise, calls } = run([{ status: 403 }]);
    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toHaveLength(1);
  });

  it('503 повторяется и доходит до успеха', async () => {
    const { promise, calls, delays } = run([{ status: 503 }, { status: 503 }, { status: 200, body: OK }]);
    await expect(promise).resolves.toEqual({ rev: 2, seq: 5 });
    expect(calls).toHaveLength(3);
    expect(delays).toEqual([500, 1000]);
  });

  it('пять попыток и не больше', async () => {
    const { promise, calls, delays } = run([{ status: 503 }]);
    await expect(promise).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(5);
    expect(delays).toEqual([500, 1000, 2000, 4000]);
  });

  it('сетевой сбой повторяется', async () => {
    const { promise, calls } = run([
      { status: 0, throws: new Error('оборвалось') },
      { status: 200, body: OK },
    ]);
    await expect(promise).resolves.toEqual({ rev: 2, seq: 5 });
    expect(calls).toHaveLength(2);
  });

  it('429 ждёт ровно столько, сколько сказал Retry-After', async () => {
    const { promise, delays } = run([
      { status: 429, headers: { 'retry-after': '2' } },
      { status: 200, body: OK },
    ]);
    await expect(promise).resolves.toEqual({ rev: 2, seq: 5 });
    expect(delays).toEqual([2000]);
  });

  it('Retry-After больше максимума отката не срезается', async () => {
    const { promise, delays } = run([
      { status: 429, headers: { 'Retry-After': '120' } },
      { status: 200, body: OK },
    ]);
    await expect(promise).resolves.toEqual({ rev: 2, seq: 5 });
    expect(delays).toEqual([120_000]);
  });

  it('не наша ошибка уходит наверх без повтора', async () => {
    let calls = 0;
    const failing = (): Promise<never> => {
      calls += 1;
      return Promise.reject(new TypeError('чужая ошибка'));
    };
    await expect(withRetry(failing, { sleep: () => Promise.resolve() })).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
  });
});
