import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveSync } from '../live';
import { emptyReport } from '../types';
import type { RunReport, RunTrigger } from '../types';
import { SPACE, testKeys } from './doubles';
import { harness } from './harness';

/** Поддельный сокет: обработчики дёргает тест, сети нет. */
class FakeSocket {
  readonly sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code: number): void {
    this.closedWith = code;
  }
}

class CountingRunner implements RunTrigger {
  runs = 0;

  run(): Promise<RunReport> {
    this.runs += 1;
    return Promise.resolve(emptyReport(SPACE, 0, 0, true));
  }
}

interface Tick {
  readonly run: () => void;
  readonly ms: number;
}

async function setup() {
  const h = harness();
  h.connection.setKeys(await testKeys());
  const runner = new CountingRunner();
  const ticks: Tick[] = [];
  const sockets: FakeSocket[] = [];
  const live = new LiveSync({
    connection: h.connection,
    runner,
    pollIntervalMs: 30_000,
    registerInterval: (run: () => void, ms: number): void => {
      ticks.push({ run, ms });
    },
    createSocket: (): WebSocket => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    log: h.log,
  });
  return { connection: h.connection, live, runner, ticks, sockets };
}

describe('живой канал и запасной опрос', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('канал не поднялся — работает интервальный опрос', async () => {
    const { live, runner, ticks, sockets } = await setup();
    live.start();
    sockets[0]?.onerror?.();

    expect(live.connected).toBe(false);
    expect(ticks[0]?.ms).toBe(30_000);
    ticks[0]?.run();
    expect(runner.runs).toBe(1);
    live.stop();
  });

  it('пока канал открыт, опрос молчит', async () => {
    const { live, runner, ticks, sockets } = await setup();
    live.start();
    sockets[0]?.onopen?.();

    expect(live.connected).toBe(true);
    ticks[0]?.run();
    expect(runner.runs).toBe(0);
    live.stop();
  });

  it('звоночек changed со свежим seq запускает прогон, устаревший игнорируется', async () => {
    const { connection, live, runner, sockets } = await setup();
    live.start();
    sockets[0]?.onopen?.();

    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: 'changed', spaceId: 'space-1', seq: 5 }) });
    expect(runner.runs).toBe(1);

    connection.setLastSeq(9);
    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: 'changed', spaceId: 'space-1', seq: 5 }) });
    expect(runner.runs).toBe(1);
    live.stop();
  });

  it('повторный старт не заводит второй таймер опроса', async () => {
    const { live, ticks } = await setup();
    live.start();
    live.start();
    expect(ticks).toHaveLength(1);
    live.stop();
  });

  it('остановленное подключение не опрашивается', async () => {
    const { connection, live, runner, ticks, sockets } = await setup();
    live.start();
    sockets[0]?.onerror?.();
    connection.setState('paused');

    ticks[0]?.run();
    expect(runner.runs).toBe(0);
    live.stop();
  });
});
