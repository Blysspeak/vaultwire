import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type { RequestFn } from '../http';

export interface FakeReply {
  readonly status: number;
  readonly body?: string;
  readonly binary?: ArrayBuffer;
  readonly headers?: Record<string, string>;
  /** Отказ транспорта: до статуса дело не дошло. */
  readonly throws?: Error;
}

export interface FakeRequest {
  readonly fn: RequestFn;
  readonly calls: RequestUrlParam[];
}

/** Поддельный requestUrl: отдаёт заготовленные ответы по очереди, последний повторяется. */
export function fakeRequest(replies: readonly FakeReply[]): FakeRequest {
  const calls: RequestUrlParam[] = [];
  let index = 0;
  const fn: RequestFn = (param: RequestUrlParam): Promise<RequestUrlResponse> => {
    calls.push(param);
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    if (reply === undefined) throw new Error('нет заготовленного ответа');
    if (reply.throws !== undefined) return Promise.reject(reply.throws);
    const body = reply.body ?? '';
    return Promise.resolve({
      status: reply.status,
      headers: reply.headers ?? {},
      text: body,
      arrayBuffer: reply.binary ?? new ArrayBuffer(0),
      json: null,
    });
  };
  return { fn, calls };
}

/** Собиратель задержек вместо реального ожидания. */
export function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number): Promise<void> => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}
