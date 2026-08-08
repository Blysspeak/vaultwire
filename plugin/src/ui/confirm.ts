import { ButtonComponent, Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';

export interface ConfirmOptions {
  readonly title: string;
  readonly body: string;
  readonly confirmText: string;
  /**
   * Строка, которую нужно набрать вручную. Задана — кнопка остаётся
   * заблокированной, пока введённое не совпадёт (удаление пространства).
   */
  readonly requiredText?: string;
  readonly prompt?: string;
}

/** Подтверждение необратимого действия; с requiredText — ещё и с набором строки. */
export class ConfirmModal extends Modal {
  private button: ButtonComponent | null = null;

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.options.title);
    contentEl.addClass('vw-confirm');
    contentEl.createEl('p', { cls: 'vw-confirm-body', text: this.options.body });

    const required = this.options.requiredText;
    if (required !== undefined) {
      new Setting(contentEl)
        .setName(this.options.prompt ?? t('confirm.prompt'))
        .setDesc(required)
        .addText((text) => {
          text.onChange((raw) => {
            this.button?.setDisabled(raw.trim() !== required);
          });
        });
    }

    // Кнопки живут в собственной строке, а не в Setting: правило «один
    // управляющий элемент на строку настройки» касается именно настроек.
    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    const cancel = new ButtonComponent(actions);
    cancel.setButtonText(t('common.cancel')).onClick(() => {
      this.close();
    });
    const confirm = new ButtonComponent(actions);
    this.button = confirm;
    confirm.setButtonText(this.options.confirmText).setWarning();
    if (required !== undefined) confirm.setDisabled(true);
    confirm.onClick(() => {
      this.close();
      this.onConfirm();
    });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
