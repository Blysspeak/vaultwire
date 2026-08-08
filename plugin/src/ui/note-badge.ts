import { MarkdownView } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';
import type { FileSyncStatus } from '../sync/file-status';
import { badgeText } from './note-badge-text';

/**
 * НЕДОКУМЕНТИРОВАННАЯ ОБЛАСТЬ. Публичного способа дописать текст в шапку вкладки
 * нет: addAction даёт только иконку. Класс контейнера заголовка держится в
 * Obsidian много версий, но гарантий нет, поэтому промах здесь ничего не ломает,
 * а лишь оставляет пользователя со строкой состояния и панелью.
 */
const TITLE_CONTAINER = '.view-header-title-container';

const BADGE_CLASS = 'vw-note-badge';

/**
 * Полупрозрачная подпись у заголовка заметки: синхронизируется ли файл, когда
 * это было в последний раз и кто внёс правку. Сам файл не трогается никогда.
 */
export class NoteBadge {
  constructor(private readonly app: App) {}

  /** Обновить подпись у активной заметки. null — файл вне подключений. */
  update(status: FileSyncStatus | null, now: number = Date.now()): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view === null) return;
    const host = view.containerEl.querySelector(TITLE_CONTAINER);
    if (!(host instanceof HTMLElement)) return;
    const badge = existing(host) ?? host.createSpan({ cls: BADGE_CLASS });
    if (status === null) {
      badge.detach();
      return;
    }
    badge.setText(badgeText(status, now));
  }

  /** Убрать подписи из всех открытых заметок: выгрузка и отключение синка. */
  clear(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      removeFrom(leaf);
    }
  }
}

function existing(host: HTMLElement): HTMLElement | null {
  const found = host.querySelector(`.${BADGE_CLASS}`);
  return found instanceof HTMLElement ? found : null;
}

function removeFrom(leaf: WorkspaceLeaf): void {
  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;
  const host = view.containerEl.querySelector(TITLE_CONTAINER);
  if (!(host instanceof HTMLElement)) return;
  existing(host)?.detach();
}
