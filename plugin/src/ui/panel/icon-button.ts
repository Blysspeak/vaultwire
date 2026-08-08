import { setIcon, type IconName } from 'obsidian';

/** Кнопка-иконка шапки. Размер значка задаётся переменной --icon-size в стилях. */
export interface IconButton {
  readonly el: HTMLButtonElement;
  /** Иконка и подпись меняются вместе: «Пауза» и «Возобновить» это одна кнопка. */
  set(icon: IconName, label: string): void;
}

export function iconButton(
  parent: HTMLElement,
  icon: IconName,
  label: string,
  run: () => void,
): IconButton {
  const el = parent.createEl('button', { cls: 'vw-icon-button' });
  // Слушатель уходит вместе с элементом: панель чистит разметку через empty().
  el.addEventListener('click', run);
  const set = (next: IconName, text: string): void => {
    setIcon(el, next);
    el.setAttr('aria-label', text);
  };
  set(icon, label);
  return { el, set };
}
