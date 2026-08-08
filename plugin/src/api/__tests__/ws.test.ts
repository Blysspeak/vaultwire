import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceIdSchema } from '@vaultwire/shared';
import type { WsChangedFrame } from '@vaultwire/shared';
import { SyncSocket, toWebSocketUrl } from '../ws';
import { parseServerFrame } from '../ws-frames';

const SPACE = spaceIdSchema.parse('space-1');

/** Поддельный сокет: обработчики дёргаются вручную. */
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

function setup(onChanged: (frame: WsChangedFrame) => void = () => {}) {
  const sockets: FakeSocket[] = [];
  const socket = new SyncSocket({
    baseUrl: 'https://obsidian.boostix.space',
    spaceId: SPACE,
    token: 'device-token',
    onChanged,
    createSocket: (): WebSocket => {
      const fake = new FakeSocket();
      sockets.push(fake);
      return fake as unknown as WebSocket;
    },
  });
  return { socket, sockets };
}

describe('адрес и разбор фреймов', () => {
  it('https становится wss, префикс пути сохраняется', () => {
    expect(toWebSocketUrl('https://obsidian.boostix.space')).toBe('wss://obsidian.boostix.space/v1/sync');
    expect(toWebSocketUrl('http://localhost:3000/')).toBe('ws://localhost:3000/v1/sync');
  });

  it('мусор в канале игнорируется', () => {
    expect(parseServerFrame('не json')).toBeNull();
    expect(parseServerFrame(JSON.stringify({ type: 'что-то' }))).toBeNull();
    expect(parseServerFrame(new ArrayBuffer(2))).toBeNull();
  });
});

describe('жизненный цикл соединения', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('первым фреймом уходит авторизация', () => {
    const { socket, sockets } = setup();
    socket.start();
    sockets[0]?.onopen?.();
    expect(socket.state).toBe('open');
    expect(JSON.parse(sockets[0]?.sent[0] ?? '')).toEqual({
      type: 'auth',
      token: 'device-token',
      spaceId: 'space-1',
      protocolVersion: 1,
    });
  });

  it('changed доходит до подписчика', () => {
    const seen: WsChangedFrame[] = [];
    const { socket, sockets } = setup((frame) => seen.push(frame));
    socket.start();
    sockets[0]?.onopen?.();
    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: 'changed', spaceId: 'space-1', seq: 12 }) });
    expect(seen).toEqual([{ type: 'changed', spaceId: 'space-1', seq: 12 }]);
  });

  it('heartbeat раз в 30 секунд, тишина 60 секунд даёт переподключение', () => {
    const { socket, sockets } = setup();
    socket.start();
    sockets[0]?.onopen?.();
    vi.advanceTimersByTime(30_000);
    expect(sockets[0]?.sent[1]).toBe('{"type":"ping"}');
    vi.advanceTimersByTime(60_000);
    expect(sockets[0]?.closedWith).not.toBeNull();
    expect(socket.state).toBe('closed');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    socket.stop();
  });

  it('закрытие при выгрузке снимает таймеры и не переподключается', () => {
    const { socket, sockets } = setup();
    socket.start();
    sockets[0]?.onopen?.();
    socket.stop();
    expect(sockets[0]?.closedWith).toBe(1000);
    vi.advanceTimersByTime(300_000);
    expect(sockets).toHaveLength(1);
    expect(socket.state).toBe('closed');
  });
});
