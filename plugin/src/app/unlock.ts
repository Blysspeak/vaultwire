import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import { addReveal } from '../ui/fields';
import { storePassword } from '../settings/remember';
import type { ConnectionSettings } from '../settings/types';
import type { SyncManager } from '../sync';
import { failureKey } from '../ui/owner/create-space-validate';

export interface UnlockDeps {
  readonly app: App;
  readonly manager: SyncManager;
  readonly connection: ConnectionSettings;
  /** Готовое объяснение сверху: например, сохранённый пароль перестал подходить. */
  readonly notice?: string;
  /** Начальное состояние переключателя; по умолчанию — как записано у подключения. */
  readonly remember?: boolean;
  save(): Promise<void>;
  /** Успешный старт; отмена окна сюда не приходит. */
  onDone(): void;
  /** Закрытие окна любым путём: вызвавшему может понадобиться перерисовка. */
  onClosed?(): void;
}

/**
 * Ввод пароля шифрования для одного подключения с последующим первым прогоном.
 * Открывается только там, где сохранённого пароля нет: с ним подключение
 * поднимается само, без единого окна.
 */
export class UnlockModal extends Modal {
  private password = '';
  private remember: boolean;
  private submit: ButtonComponent | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(private readonly deps: UnlockDeps) {
    super(deps.app);
    this.remember = deps.remember ?? deps.connection.rememberPassword;
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('unlock.title'));
    contentEl.addClass('vw-modal');
    contentEl.createDiv({
      cls: 'vw-note',
      text: `${t('unlock.space')}: ${this.deps.connection.label}`,
    });
    const notice = this.deps.notice;
    if (notice !== undefined) contentEl.createDiv({ cls: 'vw-error', text: notice });

    const passwordSetting = new Setting(contentEl)
      .setName(t('unlock.password.name'))
      .setDesc(t('unlock.password.desc'));
    let passwordInput: HTMLInputElement | null = null;
    passwordSetting.addText((field) => {
      field.inputEl.type = 'password';
      field.onChange((value) => {
        this.password = value;
      });
      passwordInput = field.inputEl;
    });
    addReveal(passwordSetting, () => passwordInput);

    new Setting(contentEl)
      .setName(t('unlock.remember.name'))
      .setDesc(t('unlock.remember.desc'))
      .addToggle((toggle) => {
        toggle.setValue(this.remember);
        toggle.onChange((value) => {
          this.remember = value;
        });
      });

    this.statusEl = contentEl.createDiv({ cls: 'vw-modal-status' });
    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('unlock.later')).onClick(() => {
      this.close();
    });
    const submit = new ButtonComponent(actions);
    this.submit = submit;
    submit
      .setButtonText(t('unlock.submit'))
      .setCta()
      .onClick(() => {
        void this.run();
      });
  }

  override onClose(): void {
    this.contentEl.empty();
    this.deps.onClosed?.();
  }

  private async run(): Promise<void> {
    if (this.password.length === 0) {
      this.statusEl?.setText(t('unlock.error.empty'));
      return;
    }
    this.submit?.setDisabled(true);
    const result = await this.deps.manager.start(this.deps.connection.spaceId, this.password);
    if (!result.ok) {
      this.submit?.setDisabled(false);
      const reason = t(failureKey(result.failure ?? 'transport'));
      this.statusEl?.setText(t('notice.unlockFailed', { reason }));
      return;
    }
    // Автосинхронизация выключена — ключи выведены, но канал и опрос стоят.
    if (!this.deps.connection.autoSync) this.deps.manager.pause(this.deps.connection.spaceId);
    // Пароль проверен верификатором: только теперь его есть смысл запоминать.
    storePassword(this.deps.connection, this.password, this.remember);
    await this.deps.save();
    this.close();
    new Notice(t('notice.unlocked', { label: this.deps.connection.label }));
    this.deps.onDone();
  }
}
