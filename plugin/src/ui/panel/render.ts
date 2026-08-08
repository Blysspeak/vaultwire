import { ButtonComponent } from 'obsidian';
import { t } from '../../i18n/ru';

/** Мелкие помощники разметки панели. DOM только через createEl и родню. */

/** Раздел вкладки: заголовок и тело, в которое кладётся содержимое. */
export function section(parent: HTMLElement, title: string): HTMLElement {
  const root = parent.createDiv({ cls: 'vw-section' });
  root.createDiv({ cls: 'vw-section-title', text: title });
  return root.createDiv({ cls: 'vw-section-body' });
}

/** Пояснение или пустое состояние. */
export function note(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ cls: 'vw-note', text });
}

export function list(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: 'vw-list' });
}

/** Строка «ключ — значение»; возвращается значение, чтобы обновлять точечно. */
export function infoRow(parent: HTMLElement, key: string): HTMLElement {
  const row = parent.createDiv({ cls: 'vw-card-row' });
  row.createSpan({ cls: 'vw-card-key', text: key });
  return row.createSpan({ cls: 'vw-card-value' });
}

export interface ItemParts {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly meta: HTMLElement;
  readonly actions: HTMLElement;
}

/** Элемент списка: путь сверху, пояснение под ним, кнопки отдельной строкой. */
export function listItem(parent: HTMLElement, title: string): ItemParts {
  const root = parent.createDiv({ cls: 'vw-item' });
  return {
    root,
    title: root.createDiv({ cls: 'vw-item-title', text: title }),
    meta: root.createDiv({ cls: 'vw-item-meta' }),
    actions: root.createDiv({ cls: 'vw-item-actions' }),
  };
}

/** Кнопка действия. Обработчик асинхронный: почти все действия ходят на диск или в сеть. */
export function actionButton(
  parent: HTMLElement,
  label: string,
  run: () => void | Promise<void>,
): ButtonComponent {
  const button = new ButtonComponent(parent);
  button.setButtonText(label);
  button.onClick(() => {
    void run();
  });
  return button;
}

export function formatMoment(at: number | null): string {
  if (at === null || at === 0) return t('panel.never');
  return new Date(at).toLocaleString();
}

const KB = 1024;
const MB = KB * 1024;

export function formatSize(bytes: number): string {
  if (bytes < KB) return t('unit.bytes', { count: bytes });
  if (bytes < MB) return t('unit.kilobytes', { count: Math.round(bytes / KB) });
  return t('unit.megabytes', { count: (bytes / MB).toFixed(1) });
}

/** Части пояснения через разделитель; пустые куски выкидываются. */
export function joinMeta(parts: readonly (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part.length > 0).join(' · ');
}
