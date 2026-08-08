import { ButtonComponent, Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { MessageKey } from '../i18n/ru';

export interface PromptOptions {
  readonly title: MessageKey;
  readonly name: MessageKey;
  readonly initial: string;
}

/** Ввод одной строки: переименование метки устройства и подобное. */
export class PromptModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly options: PromptOptions,
    private readonly onSubmit: (value: string) => void,
  ) {
    super(app);
    this.value = options.initial;
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t(this.options.title));
    contentEl.addClass('vw-modal');

    new Setting(contentEl).setName(t(this.options.name)).addText((field) => {
      field.setValue(this.value);
      field.onChange((raw) => {
        this.value = raw;
      });
    });

    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('common.cancel')).onClick(() => {
      this.close();
    });
    new ButtonComponent(actions)
      .setButtonText(t('common.save'))
      .setCta()
      .onClick(() => {
        const value = this.value.trim();
        if (value.length === 0) return;
        this.close();
        this.onSubmit(value);
      });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
