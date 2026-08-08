import { describe, expect, it } from 'vitest';
import type { ConnectionSettings } from '../../settings/types';
import { SyncWatcher, WATCH_DEBOUNCE_MS } from '../watcher';
import { emptyReport } from '../types';
import type { RunReport, RunTrigger } from '../types';
import { FakeTimers, SPACE, connectionSettings } from './doubles';
import { harness } from './harness';

/** Прогон в этих тестах только считает вызовы: сеть наблюдателю не нужна. */
class CountingRunner implements RunTrigger {
  runs = 0;

  run(): Promise<RunReport> {
    this.runs += 1;
    return Promise.resolve(emptyReport(SPACE, 0, 0, true));
  }
}

function setup(overrides: Partial<ConnectionSettings> = {}) {
  const { connection } = harness(connectionSettings(overrides));
  const runner = new CountingRunner();
  const timers = new FakeTimers();
  const watcher = new SyncWatcher({ connection, runner, timers });
  return { connection, runner, timers, watcher };
}

describe('дебаунс событий хранилища', () => {
  it('серия правок одного файла даёт один прогон', () => {
    const { runner, timers, watcher } = setup();
    watcher.noteChange('Команда/Заметка.md');
    timers.advance(100);
    watcher.noteChange('Команда/Заметка.md');
    timers.advance(100);
    watcher.noteChange('Команда/Заметка.md');
    expect(runner.runs).toBe(0);

    timers.advance(WATCH_DEBOUNCE_MS);
    expect(runner.runs).toBe(1);
  });

  it('путь копится сразу, прогон запрашивается после паузы', () => {
    const { connection, runner, timers, watcher } = setup();
    watcher.noteChange('Команда/Заметка.md');
    expect(connection.pendingCount).toBe(1);
    expect(runner.runs).toBe(0);
    timers.advance(WATCH_DEBOUNCE_MS);
    expect(runner.runs).toBe(1);
    expect(connection.drain().paths).toEqual(['Заметка.md']);
  });

  it('остановка снимает отложенные таймеры', () => {
    const { runner, timers, watcher } = setup();
    watcher.noteChange('Команда/Заметка.md');
    watcher.stop();
    timers.advance(WATCH_DEBOUNCE_MS * 10);
    expect(runner.runs).toBe(0);
    expect(timers.size).toBe(0);
  });

  it('выключенная автосинхронизация копит пути, но не запускает прогон', () => {
    const { connection, runner, timers, watcher } = setup({ autoSync: false });
    watcher.noteChange('Команда/Заметка.md');
    timers.advance(WATCH_DEBOUNCE_MS);
    expect(runner.runs).toBe(0);
    expect(connection.pendingCount).toBe(1);
  });
});

describe('отбор путей', () => {
  it('файлы вне подключённой папки не попадают в очередь', () => {
    const { connection, runner, timers, watcher } = setup();
    watcher.noteChange('Личное/Заметка.md');
    watcher.noteChange('Командаснова/Заметка.md');
    timers.advance(WATCH_DEBOUNCE_MS);
    expect(connection.pendingCount).toBe(0);
    expect(runner.runs).toBe(0);
  });

  it('жёстко исключённые и временные пути отбрасываются', () => {
    const { connection, watcher } = setup();
    watcher.noteChange('Команда/.trash/Заметка.md');
    watcher.noteChange('Команда/.obsidian/workspace.json');
    watcher.noteChange('Команда/Заметка.md.tmp');
    expect(connection.pendingCount).toBe(0);
  });

  it('путь под подавлением эха игнорируется', () => {
    const { connection, watcher } = setup();
    connection.echo.beginApply('Заметка.md');
    watcher.noteChange('Команда/Заметка.md');
    expect(connection.pendingCount).toBe(0);
    connection.echo.endApply('Заметка.md');
    watcher.noteChange('Команда/Заметка.md');
    expect(connection.pendingCount).toBe(1);
  });

  it('переезд внутри подключения даёт подсказку на переименование', () => {
    const { connection, watcher } = setup();
    watcher.noteRename('Команда/Старое.md', 'Команда/Новое.md', { mtime: 10, ctime: 5, size: 3 });
    const pending = connection.drain();
    expect(pending.renames).toEqual([
      { fromPath: 'Старое.md', toPath: 'Новое.md', file: { path: 'Новое.md', mtime: 10, ctime: 5, size: 3 } },
    ]);
  });

  it('переезд из подключения наружу подсказки не даёт', () => {
    const { connection, watcher } = setup();
    watcher.noteRename('Команда/Старое.md', 'Личное/Новое.md', { mtime: 10, ctime: 5, size: 3 });
    const pending = connection.drain();
    expect(pending.renames).toEqual([]);
    expect(pending.paths).toEqual(['Старое.md']);
  });
});
