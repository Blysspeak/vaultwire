import type { App } from 'obsidian';

/**
 * Подсветка файлов, в которые только что прилетели чужие изменения.
 *
 * ВНИМАНИЕ: разметка файлового проводника Obsidian публичным API не описана.
 * Все зацепки за неё собраны здесь двумя константами: сломается обновление —
 * чинится одно место. Элемент может не найтись (проводник закрыт, папка
 * свёрнута, разметка сменилась) — тогда подсветки просто нет, исключений наружу
 * не летит и остальная работа плагина не страдает.
 */
const EXPLORER_ROW = '.nav-file-title';
const PATH_ATTR = 'data-path';

/** Свой класс-маркер: стили висят на нём, чужие классы не переопределяются. */
export const INCOMING_CLASS = 'vw-incoming';
/** Второй класс запускает затухание: снятие первого оборвало бы transition. */
export const INCOMING_FADE_CLASS = 'vw-incoming-out';

export const INCOMING_HOLD_MS = 30_000;
/** Держится в согласии с длительностью transition в styles/incoming.css. */
export const INCOMING_FADE_MS = 1_200;
/** Строка только что созданного файла появляется в проводнике не мгновенно. */
export const INCOMING_RETRY_MS = 500;

export class IncomingHighlight {
  private readonly timers = new Map<string, number>();

  constructor(
    private readonly app: App,
    private readonly holdMs: number = INCOMING_HOLD_MS,
  ) {}

  /** Пути от корня хранилища: ровно то, что отдаёт прогон в report.pulled. */
  mark(paths: readonly string[]): void {
    for (const path of paths) this.markOne(path, true);
  }

  /** Снимается вместе с плагином: висящих таймеров после выгрузки быть не должно. */
  dispose(): void {
    for (const [path, handle] of this.timers) {
      window.clearTimeout(handle);
      this.clear(path);
    }
    this.timers.clear();
  }

  private markOne(path: string, retry: boolean): void {
    this.stop(path);
    const row = this.row(path);
    if (row === null) {
      if (retry) {
        this.after(path, INCOMING_RETRY_MS, () => {
          this.markOne(path, false);
        });
      }
      return;
    }
    row.removeClass(INCOMING_FADE_CLASS);
    row.addClass(INCOMING_CLASS);
    this.after(path, this.holdMs, () => {
      this.row(path)?.addClass(INCOMING_FADE_CLASS);
      this.after(path, INCOMING_FADE_MS, () => {
        this.clear(path);
      });
    });
  }

  private after(path: string, ms: number, run: () => void): void {
    this.timers.set(
      path,
      window.setTimeout(() => {
        this.timers.delete(path);
        run();
      }, ms),
    );
  }

  private stop(path: string): void {
    const handle = this.timers.get(path);
    if (handle === undefined) return;
    window.clearTimeout(handle);
    this.timers.delete(path);
  }

  private clear(path: string): void {
    const row = this.row(path);
    if (row === null) return;
    row.removeClass(INCOMING_CLASS);
    row.removeClass(INCOMING_FADE_CLASS);
  }

  private row(path: string): HTMLElement | null {
    const rows = this.app.workspace.containerEl.querySelectorAll<HTMLElement>(EXPLORER_ROW);
    for (const row of Array.from(rows)) {
      if (row.getAttribute(PATH_ATTR) === path) return row;
    }
    return null;
  }
}
