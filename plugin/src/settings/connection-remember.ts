import { Setting } from 'obsidian';
import { t } from '../i18n/ru';
import { toggleRemember } from './remember';
import type { ConnectionSettings } from './types';

export interface RememberRowDeps {
  readonly connection: ConnectionSettings;
  save(): Promise<void>;
  /** Включение: спросить пароль; done вызывается по закрытию окна. */
  requestPassword(done: () => void): void;
}

/**
 * Строка «запомнить пароль» в настройках подключения. Работает мимо черновика:
 * выключение стирает пароль сразу, включение открывает окно ввода, и до его
 * успеха флаг не меняется. Возврат переключателя на место нажатием не считается.
 */
export function renderRememberRow(root: HTMLElement, deps: RememberRowDeps): void {
  let syncing = false;
  new Setting(root)
    .setName(t('connSettings.remember.name'))
    .setDesc(t('connSettings.remember.desc'))
    .addToggle((toggle) => {
      toggle.setValue(deps.connection.rememberPassword);
      toggle.onChange((value) => {
        if (syncing) return;
        void toggleRemember(
          {
            connection: deps.connection,
            save: () => deps.save(),
            requestPassword: () => {
              deps.requestPassword(() => {
                syncing = true;
                toggle.setValue(deps.connection.rememberPassword);
                syncing = false;
              });
            },
          },
          value,
        );
      });
    });
}
