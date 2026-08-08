import { describe, expect, it } from 'vitest';
import { SyncHub, type HubSocket } from '#services/hub';

class FakeSocket implements HubSocket {
  readonly sent: string[] = [];
  closed = false;
  failing = false;

  send(data: string): void {
    if (this.failing) throw new Error('сокет уже закрыт');
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

const SPACE = 'space-1';

describe('SyncHub', () => {
  it('шлёт звоночек всем в пространстве, кроме автора', () => {
    const hub = new SyncHub();
    const author = new FakeSocket();
    const peer = new FakeSocket();
    hub.subscribe(SPACE, 'device-author', author);
    hub.subscribe(SPACE, 'device-peer', peer);

    expect(hub.broadcastChanged(SPACE, 7, 'device-author')).toBe(1);
    expect(author.sent).toEqual([]);
    expect(JSON.parse(peer.sent[0] ?? 'null')).toEqual({ type: 'changed', spaceId: SPACE, seq: 7 });
  });

  it('не задевает соседние пространства', () => {
    const hub = new SyncHub();
    const other = new FakeSocket();
    hub.subscribe('space-2', 'device-other', other);

    expect(hub.broadcastChanged(SPACE, 1, 'device-author')).toBe(0);
    expect(other.sent).toEqual([]);
  });

  it('отписка при закрытии убирает соединение полностью', () => {
    const hub = new SyncHub();
    const socket = new FakeSocket();
    const unsubscribe = hub.subscribe(SPACE, 'device-peer', socket);

    unsubscribe();

    expect(hub.connectionsOf(SPACE)).toBe(0);
    expect(hub.size).toBe(0);
    expect(hub.broadcastChanged(SPACE, 2, 'device-author')).toBe(0);
    expect(socket.sent).toEqual([]);
  });

  it('повторная отписка безопасна', () => {
    const hub = new SyncHub();
    const unsubscribe = hub.subscribe(SPACE, 'device-peer', new FakeSocket());
    unsubscribe();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
    expect(hub.size).toBe(0);
  });

  it('отвалившееся соединение снимается и не мешает остальным', () => {
    const hub = new SyncHub();
    const broken = new FakeSocket();
    broken.failing = true;
    const alive = new FakeSocket();
    hub.subscribe(SPACE, 'device-broken', broken);
    hub.subscribe(SPACE, 'device-alive', alive);

    expect(hub.broadcastChanged(SPACE, 3, 'device-author')).toBe(1);
    expect(broken.closed).toBe(true);
    expect(hub.connectionsOf(SPACE)).toBe(1);
    expect(alive.sent).toHaveLength(1);
  });

  it('отзыв устройства закрывает его соединения', () => {
    const hub = new SyncHub();
    const revoked = new FakeSocket();
    const kept = new FakeSocket();
    hub.subscribe(SPACE, 'device-revoked', revoked);
    hub.subscribe('space-2', 'device-kept', kept);

    expect(hub.dropDevice('device-revoked')).toBe(1);
    expect(revoked.closed).toBe(true);
    expect(kept.closed).toBe(false);
    expect(hub.size).toBe(1);
  });
});
