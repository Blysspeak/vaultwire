import { describe, expect, it } from 'vitest';
import { createVerifier, deriveBundle, toBase64 } from '../../crypto';
import type { Bytes, KeyBundle } from '../../crypto';
import { entry } from '../../engine/__tests__/fakes';
import { bootstrapConnection } from '../bootstrap';
import { SPACE, connectionSettings } from './doubles';
import { harness } from './harness';

const PASSWORD = 'верный пароль';
/** Соль фиксирована, чтобы дорогой PBKDF2 считался один раз на эпоху. */
const SALT: Bytes = new Uint8Array(32).fill(7);
const bundles = new Map<number, KeyBundle>();

async function keysFor(epoch: number): Promise<KeyBundle> {
  const cached = bundles.get(epoch);
  if (cached !== undefined) return cached;
  const bundle = await deriveBundle(PASSWORD, SALT, epoch);
  bundles.set(epoch, bundle);
  return bundle;
}

/** Ответ GET /spaces с солью и верификатором от известного пароля. */
async function spaceBody(epoch = 1, role: 'rw' | 'ro' = 'rw'): Promise<string> {
  const keys = await keysFor(epoch);
  return JSON.stringify({
    seq: 7,
    role,
    docCount: 3,
    bytes: 100,
    epoch,
    salt: toBase64(SALT),
    verifier: await createVerifier(keys.metaKey, SPACE),
    retentionDays: 30,
  });
}

describe('стартовая последовательность', () => {
  it('верный пароль поднимает ключи и переводит подключение в ожидание', async () => {
    const h = harness();
    h.reply = { status: 200, body: await spaceBody() };

    const result = await bootstrapConnection(h.connection, PASSWORD, h.log);

    expect(result).toEqual({ ok: true, failure: null });
    expect(h.connection.keys).not.toBeNull();
    expect(h.connection.state).toBe('idle');
  });

  it('неверный пароль останавливает подключение и ничего не пишет', async () => {
    const h = harness();
    h.reply = { status: 200, body: await spaceBody() };

    const result = await bootstrapConnection(h.connection, 'опечатка', h.log);

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('password');
    expect(h.connection.keys).toBeNull();
    expect(h.connection.state).toBe('error');

    // Прогон после провала верификатора не стартует и в сеть не ходит.
    const before = h.calls.length;
    const report = await h.runner.run();
    expect(report.idle).toBe(true);
    expect(h.calls).toHaveLength(before);
    expect(h.gateway.events).toHaveLength(0);
  });

  it('роль только для чтения даёт соответствующее состояние', async () => {
    const h = harness();
    h.reply = { status: 200, body: await spaceBody(1, 'ro') };

    await bootstrapConnection(h.connection, PASSWORD, h.log);

    expect(h.connection.state).toBe('readonly');
    expect(h.connection.role).toBe('ro');
  });

  it('расхождение эпохи принимается на пустом индексе', async () => {
    const h = harness();
    h.reply = { status: 200, body: await spaceBody(2) };

    expect((await bootstrapConnection(h.connection, PASSWORD, h.log)).ok).toBe(true);
    expect(h.connection.settings.keyEpoch).toBe(2);
  });

  it('расхождение эпохи на заполненном индексе останавливает подключение', async () => {
    const h = harness(connectionSettings());
    h.reply = { status: 200, body: await spaceBody(2) };
    // Индекс должен пережить загрузку в самом начале стартовой последовательности.
    h.connection.index.set(entry('Заметка.md'));
    await h.connection.index.flush();

    const result = await bootstrapConnection(h.connection, PASSWORD, h.log);

    expect(result.failure).toBe('epoch');
    expect(h.connection.keys).toBeNull();
    expect(h.connection.state).toBe('error');
  });

  it('отозванный токен виден уже на старте', async () => {
    const h = harness();
    h.reply = { status: 401, body: JSON.stringify({ code: 'unauthorized', message: 'токен отозван' }) };

    const result = await bootstrapConnection(h.connection, PASSWORD, h.log);

    expect(result.ok).toBe(false);
    expect(h.connection.state).toBe('revoked');
  });
});
