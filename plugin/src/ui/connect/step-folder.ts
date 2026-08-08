import { Setting } from 'obsidian';
import { normalizeRelPath } from '../../crypto';
import { t } from '../../i18n/ru';
import { FolderPicker } from './folder-picker';
import { validateFolderChoice } from './folder-rules';
import { errorText, infoRow } from './rows';
import type { StepHost } from './state';

/**
 * Шаг выбора локальной папки. Проверки те же, что у движка: папки подключений
 * не вкладываются друг в друга, одно пространство подключается один раз.
 * Папка на этом шаге не создаётся: до подтверждения плана мастер не пишет ничего.
 */
export function renderFolderStep(root: HTMLElement, host: StepHost): void {
  const state = host.state;
  new Setting(root).setName(t('connect.folder.heading')).setHeading();

  new Setting(root)
    .setName(t('connect.folder.name'))
    .setDesc(t('connect.folder.desc'))
    .addText((text) => {
      text.setPlaceholder(t('connect.folder.placeholder'));
      text.setValue(state.folder);
      text.onChange((raw) => {
        state.folder = raw;
        state.error = null;
        paint();
      });
    });

  new Setting(root)
    .setName(t('connect.folder.pick.name'))
    .setDesc(t('connect.folder.pick.desc'))
    .addButton((button) => {
      button.setButtonText(t('connect.folder.pick.button'));
      button.onClick(() => {
        new FolderPicker(host.app, (path) => {
          state.folder = path;
          state.error = null;
          host.refresh();
        }).open();
      });
    });

  new Setting(root)
    .setName(t('connect.folder.label.name'))
    .setDesc(t('connect.folder.label.desc'))
    .addText((text) => {
      text.setValue(state.label);
      text.onChange((raw) => {
        state.label = raw;
      });
    });

  const details = root.createDiv({ cls: 'vw-hint' });
  paint();

  function paint(): void {
    details.empty();
    const payload = state.payload;
    if (payload === null) return;
    const issue = validateFolderChoice({
      folder: state.folder,
      spaceId: payload.s,
      existing: host.existing(),
    });
    state.folderIssue = issue;
    if (issue !== null) {
      errorText(details, t(`connect.folder.error.${issue}`));
      return;
    }
    infoRow(details, t('connect.folder.target'), folderLabel(state.folder));
  }
}

export function folderLabel(folder: string): string {
  const normalized = normalizeRelPath(folder);
  return normalized === '' ? t('folder.pick.root') : normalized;
}
