import { Setting } from 'obsidian';
import { t } from '../../i18n/ru';
import { serverHost } from './code';
import { infoRow } from './rows';
import { folderLabel } from './step-folder';
import type { StepHost } from './state';

/**
 * Шаг пароля. Сам ввод ничего не запускает: проверка верификатора идёт по
 * кнопке мастера, и до её успеха подключение не создаётся (разделы 2 и 9).
 */
export function renderPasswordStep(root: HTMLElement, host: StepHost): void {
  const state = host.state;
  new Setting(root).setName(t('connect.password.heading')).setHeading();

  new Setting(root)
    .setName(t('connect.password.name'))
    .setDesc(t('connect.password.desc'))
    .addText((text) => {
      text.inputEl.type = 'password';
      text.setValue(state.password);
      text.onChange((raw) => {
        state.password = raw;
        state.error = null;
      });
    });

  new Setting(root)
    .setName(t('connect.password.remember.name'))
    .setDesc(t('connect.password.remember.desc'))
    .addToggle((toggle) => {
      toggle.setValue(state.rememberPassword);
      toggle.onChange((value) => {
        state.rememberPassword = value;
      });
    });

  const details = root.createDiv({ cls: 'vw-hint' });
  const payload = state.payload;
  if (payload !== null) {
    infoRow(details, t('connect.code.server'), serverHost(payload.u));
    infoRow(details, t('connect.code.space'), payload.s);
    infoRow(details, t('connect.folder.target'), folderLabel(state.folder));
  }
  if (state.busy) details.createDiv({ cls: 'vw-note', text: t('connect.password.busy') });
}
