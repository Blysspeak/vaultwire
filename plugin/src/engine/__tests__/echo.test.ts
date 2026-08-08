import { describe, expect, it } from 'vitest';
import { EchoGuard } from '../echo';
import { entry } from './fakes';

describe('подавление эха', () => {
  it('принятая запись не уходит обратно на сервер', async () => {
    const echo = new EchoGuard();
    const applied: string[] = [];
    await echo.wrap('a.md', async () => {
      // Событие modify прилетает во время записи, и в этот момент отправка запрещена.
      applied.push(echo.shouldPush('a.md', 'новый-хеш', entry('a.md')) ? 'push' : 'suppressed');
    });
    expect(applied).toEqual(['suppressed']);
    expect(echo.isApplying('a.md')).toBe(false);
  });

  it('второй барьер: совпадение хеша с индексом отменяет отправку', () => {
    const echo = new EchoGuard();
    const index = entry('a.md', { plainHash: 'h1' });
    expect(echo.shouldPush('a.md', 'h1', index)).toBe(false);
    expect(echo.shouldPush('a.md', 'h2', index)).toBe(true);
  });

  it('правка пользователя после применения уходит на сервер', async () => {
    const echo = new EchoGuard();
    await echo.wrap('a.md', async () => undefined);
    expect(echo.shouldPush('a.md', 'h2', entry('a.md', { plainHash: 'h1' }))).toBe(true);
  });

  it('флаг снимается даже когда запись упала', async () => {
    const echo = new EchoGuard();
    await expect(
      echo.wrap('a.md', () => Promise.reject(new Error('диск занят'))),
    ).rejects.toThrow('диск занят');
    expect(echo.isApplying('a.md')).toBe(false);
  });

  it('зависший флаг снимается по истечении срока', () => {
    let now = 0;
    const echo = new EchoGuard({ ttlMs: 100, now: () => now });
    echo.beginApply('a.md');
    expect(echo.isApplying('a.md')).toBe(true);
    now = 200;
    expect(echo.isApplying('a.md')).toBe(false);
  });

  it('вложенные применения одного пути считаются по одному', () => {
    const echo = new EchoGuard();
    echo.beginApply('a.md');
    echo.beginApply('a.md');
    echo.endApply('a.md');
    expect(echo.isApplying('a.md')).toBe(true);
    echo.endApply('a.md');
    expect(echo.isApplying('a.md')).toBe(false);
  });

  it('файл без записи в индексе всегда отправляется', () => {
    expect(new EchoGuard().shouldPush('new.md', 'h1', undefined)).toBe(true);
  });
});
