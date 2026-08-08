import { describe, expect, it } from 'vitest';
import { testKeys } from './doubles';
import { harness } from './harness';

function changesCalls(calls: readonly string[]): string[] {
  return calls.filter((call) => call.includes('/changes'));
}

describe('склейка прогонов', () => {
  it('запросы во время прогона сливаются в один следующий', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.block();

    const first = h.runner.run();
    const second = h.runner.run();
    const third = h.runner.run();

    expect(second).toBe(third);
    expect(second).not.toBe(first);
    h.open();
    await Promise.all([first, second, third]);
    // Три запроса дали два прогона: один шёл, два оставшихся слиплись.
    expect(changesCalls(h.calls)).toHaveLength(2);
  });

  it('после завершения прогона следующий запускается заново', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    await h.runner.run();
    expect(h.runner.busy).toBe(false);
    await h.runner.run();
    expect(changesCalls(h.calls)).toHaveLength(2);
  });

  it('пустой прогон двигает курсор и время последней синхронизации', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.reply = { status: 200, body: JSON.stringify({ seq: 42, items: [] }) };
    const report = await h.runner.run();
    expect(report.idle).toBe(false);
    expect(report.lastSeq).toBe(42);
    expect(h.connection.lastSeq).toBe(42);
    expect(h.connection.settings.lastSyncedAt).not.toBeNull();
    expect(h.connection.state).toBe('idle');
  });
});

describe('реакция на ответы сервера', () => {
  it('401 переводит подключение в отозванный доступ и останавливает его', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.reply = { status: 401, body: JSON.stringify({ code: 'unauthorized', message: 'токен отозван' }) };

    const report = await h.runner.run();
    expect(report.idle).toBe(true);
    expect(h.connection.state).toBe('revoked');

    const before = h.calls.length;
    await h.runner.run();
    // Отозванное подключение в сеть больше не ходит и данные на диске не трогает.
    expect(h.calls).toHaveLength(before);
    expect(h.gateway.events).toHaveLength(0);
  });

  it('обрыв транспорта уводит подключение в офлайн', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.reply = { status: 0, body: '', throws: new Error('сеть недоступна') };
    await h.runner.run();
    expect(h.connection.state).toBe('offline');
  });

  it('сбой сервера оставляет подключение в состоянии ошибки', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.reply = { status: 500, body: '' };
    await h.runner.run();
    expect(h.connection.state).toBe('error');
  });

  it('роль только для чтения оставляет подключение в состоянии чтения', async () => {
    const h = harness();
    h.connection.settings.role = 'ro';
    h.connection.setKeys(await testKeys());
    await h.runner.run();
    expect(h.connection.state).toBe('readonly');
  });

  it('без ключей прогон не начинается', async () => {
    const h = harness();
    const report = await h.runner.run();
    expect(report.idle).toBe(true);
    expect(h.calls).toHaveLength(0);
  });
});
