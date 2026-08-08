import { Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { MessageKey } from '../i18n/ru';
import { folderOptions } from './folders';

/** Обычная строка настройки с одним текстовым полем. */
export function textField(
  root: HTMLElement,
  name: MessageKey,
  desc: MessageKey,
  initial: string,
  onChange: (value: string) => void,
): void {
  new Setting(root)
    .setName(t(name))
    .setDesc(t(desc))
    .addText((field) => {
      field.setValue(initial);
      field.onChange(onChange);
    });
}

/**
 * Поле секрета: type=password, без начального значения и без подсказки с ним.
 * Пароли и токены не должны попадать ни в разметку, ни в атрибуты.
 */
export function secretField(
  root: HTMLElement,
  name: MessageKey,
  desc: MessageKey,
  onChange: (value: string) => void,
): void {
  const setting = new Setting(root).setName(t(name)).setDesc(t(desc));
  let input: HTMLInputElement | null = null;
  setting.addText((field) => {
    field.inputEl.type = 'password';
    field.onChange(onChange);
    input = field.inputEl;
  });
  addReveal(setting, () => input);
}

/**
 * Переключатель показа секрета. Ошибку в пароле иначе замечают только после того,
 * как пространство создано и стало нечитаемым, а исправить это уже нечем.
 */
export function addReveal(setting: Setting, target: () => HTMLInputElement | null): void {
  setting.addExtraButton((button) => {
    let shown = false;
    button.setIcon('eye').setTooltip(t('common.reveal'));
    button.onClick(() => {
      const input = target();
      if (input === null) return;
      shown = !shown;
      input.type = shown ? 'text' : 'password';
      button.setIcon(shown ? 'eye-off' : 'eye');
      button.setTooltip(t(shown ? 'common.hide' : 'common.reveal'));
      input.focus();
    });
  });
}

/** Выбор папки хранилища; пустое значение — корень. */
export function folderField(
  root: HTMLElement,
  app: App,
  name: MessageKey,
  desc: MessageKey,
  initial: string,
  onChange: (folder: string) => void,
): void {
  new Setting(root)
    .setName(t(name))
    .setDesc(t(desc))
    .addDropdown((dropdown) => {
      for (const option of folderOptions(app)) dropdown.addOption(option.value, option.label);
      dropdown.setValue(initial);
      dropdown.onChange(onChange);
    });
}

/** Строка настройки с многострочным полем: маски по одной на строку. */
export function linesField(
  root: HTMLElement,
  name: MessageKey,
  desc: MessageKey,
  initial: readonly string[],
  onChange: (lines: string[]) => void,
): void {
  new Setting(root)
    .setName(t(name))
    .setDesc(t(desc))
    .addTextArea((field) => {
      field.setValue(initial.join('\n'));
      field.onChange((raw) => {
        onChange(splitLines(raw));
      });
    });
}

/** Пустые строки и пробелы по краям в масках смысла не несут. */
export function splitLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
