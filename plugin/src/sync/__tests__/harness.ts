import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { createClient } from '../../api/client';
import type { RequestFn } from '../../api/http';
import { FakeAdapter, FakeGateway } from '../../engine/__tests__/fake-vault';
import { ConnectionIndex } from '../../engine/state';
import { RingLog } from '../../log';
import type { ConnectionSettings } from '../../settings/types';
import { SyncConnection } from '../connection';
import { SyncRunner } from '../runner';
import { FakeReader, LIMITS, connectionSettings } from './doubles';

export interface Reply {
  readonly status: number;
  readonly body: string;
  /** Сырое тело: скачивание блоба. */
  readonly binary?: ArrayBuffer;
  /** Отказ транспорта: до статуса дело не дошло. */
  readonly throws?: Error;
}

/** Разбор запроса по адресу; null — отдать общий ответ стенда. */
export type Handler = (param: RequestUrlParam) => Reply | null;

/** Пустой ответ changes: этого хватает прогону над пустым хранилищем. */
export const EMPTY_CHANGES: Reply = { status: 200, body: JSON.stringify({ seq: 0, items: [] }) };

/** Подключение целиком на подделках: сеть, хранилище и индекс живут в памяти. */
export interface Harness {
  readonly connection: SyncConnection;
  readonly runner: SyncRunner;
  readonly reader: FakeReader;
  readonly gateway: FakeGateway;
  readonly log: RingLog;
  readonly calls: string[];
  reply: Reply;
  handler: Handler | null;
  /** Задержать ответы сервера, чтобы прогон не успел закончиться. */
  block(): void;
  open(): void;
}

export function harness(settings: ConnectionSettings = connectionSettings()): Harness {
  const calls: string[] = [];
  let gate: Promise<void> = Promise.resolve();
  let release: (() => void) | null = null;
  const state: { reply: Reply; handler: Handler | null } = { reply: EMPTY_CHANGES, handler: null };

  const request: RequestFn = async (param: RequestUrlParam): Promise<RequestUrlResponse> => {
    calls.push(`${param.method ?? 'GET'} ${param.url}`);
    await gate;
    const reply = state.handler?.(param) ?? state.reply;
    if (reply.throws !== undefined) throw reply.throws;
    return {
      status: reply.status,
      headers: {},
      text: reply.body,
      arrayBuffer: reply.binary ?? new ArrayBuffer(0),
      json: null,
    };
  };

  const reader = new FakeReader();
  const gateway = new FakeGateway();
  const log = new RingLog();
  const index = new ConnectionIndex(new FakeAdapter(), {
    configDir: '.obsidian',
    spaceId: settings.spaceId,
  });
  // Повторы в тестах не нужны: они только добавляют секунды ожидания.
  const client = createClient({
    baseUrl: settings.serverUrl,
    token: settings.deviceToken,
    request,
    retry: { maxAttempts: 1 },
  });
  const connection = new SyncConnection(settings, client, index);
  const runner = new SyncRunner({ connection, reader, gateway, limits: () => LIMITS, log });

  return {
    connection,
    runner,
    reader,
    gateway,
    log,
    calls,
    get reply(): Reply {
      return state.reply;
    },
    set reply(value: Reply) {
      state.reply = value;
    },
    get handler(): Handler | null {
      return state.handler;
    },
    set handler(value: Handler | null) {
      state.handler = value;
    },
    block(): void {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    open(): void {
      const resolve = release;
      gate = Promise.resolve();
      release = null;
      resolve?.();
    },
  };
}
