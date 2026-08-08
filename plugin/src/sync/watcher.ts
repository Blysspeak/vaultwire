import { isHardExcluded, isTempFile } from '../engine/path-filter';
import type { LocalFile } from '../engine/types';
import type { SyncConnection } from './connection';
import { relativePath } from './paths';
import { WINDOW_TIMERS } from './types';
import type { RunTrigger, Timers } from './types';

/**
 * Раздел 6: Obsidian сохраняет файл примерно через 2 секунды бездействия,
 * поэтому дебаунс больше 300 мс делает синхронизацию вялой без всякой пользы.
 */
export const WATCH_DEBOUNCE_MS = 300;

export interface WatcherDeps {
  readonly connection: SyncConnection;
  readonly runner: RunTrigger;
  readonly timers?: Timers;
  readonly debounceMs?: number;
}

/**
 * События хранилища на одно подключение. Пути вне подключённой папки,
 * жёстко исключённые и находящиеся под подавлением эха отбрасываются здесь,
 * до накопления: иначе собственная запись принятого файла вернётся отправкой.
 */
export class SyncWatcher {
  private readonly timers: Timers;
  private readonly debounceMs: number;
  private readonly pending = new Map<string, number>();
  private stopped = false;

  constructor(private readonly deps: WatcherDeps) {
    this.timers = deps.timers ?? WINDOW_TIMERS;
    this.debounceMs = deps.debounceMs ?? WATCH_DEBOUNCE_MS;
  }

  /** create, modify и delete приходят сюда одинаково: разберётся сверочный скан. */
  noteChange(path: string): void {
    const relPath = this.accept(path);
    if (relPath === null) return;
    this.deps.connection.markDirty(relPath);
    this.schedule(relPath);
  }

  /**
   * Переезд уходит одним запросом POST /moves, поэтому подсказка нужна целиком.
   * stat = null (папка или исчезнувший файл) — обычная пара изменений.
   */
  noteRename(oldPath: string, newPath: string, stat: Omit<LocalFile, 'path'> | null): void {
    const from = this.accept(oldPath);
    const to = this.accept(newPath);
    if (from !== null && to !== null && stat !== null) {
      this.deps.connection.markRename({ fromPath: from, toPath: to, file: { path: to, ...stat } });
      this.deps.connection.markDirty(to);
      this.schedule(to);
      return;
    }
    // Одна из сторон вне подключения: для него это простое создание или удаление.
    if (from !== null) this.noteChange(oldPath);
    if (to !== null) this.noteChange(newPath);
  }

  stop(): void {
    this.stopped = true;
    for (const handle of this.pending.values()) this.timers.clearTimeout(handle);
    this.pending.clear();
  }

  get pendingTimers(): number {
    return this.pending.size;
  }

  /** null — путь не относится к подключению или это наша собственная запись. */
  private accept(path: string): string | null {
    const relPath = relativePath(this.deps.connection.folder, path);
    if (relPath === null || isHardExcluded(relPath) || isTempFile(relPath)) return null;
    if (this.deps.connection.echo.isApplying(relPath)) return null;
    return relPath;
  }

  /** Дебаунс на файл: правка копится, прогон запрашивается один раз на файл. */
  private schedule(relPath: string): void {
    if (this.stopped || !this.deps.connection.settings.autoSync) return;
    const previous = this.pending.get(relPath);
    if (previous !== undefined) this.timers.clearTimeout(previous);
    const handle = this.timers.setTimeout(() => {
      this.pending.delete(relPath);
      void this.deps.runner.run();
    }, this.debounceMs);
    this.pending.set(relPath, handle);
  }
}
