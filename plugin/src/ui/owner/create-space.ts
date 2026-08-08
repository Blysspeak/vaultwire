import { ButtonComponent, Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../../i18n/ru';
import { folderField, secretField, textField } from '../fields';
import { errorText } from '../format';
import { createSpaceConnection } from './create-space-run';
import type { CreateSpaceDeps, CreateSpaceInput } from './create-space-run';
import { connectionLabel, failureKey, validateCreateSpace } from './create-space-validate';

/** Что модальному окну нужно сверх процедуры создания. */
export interface CreateSpaceModalDeps extends Omit<CreateSpaceDeps, 'progress' | 'files'> {
  /** Токен из настроек, если поле окна оставлено пустым. */
  readonly savedToken: string;
  /** Вкладку настроек перерисовывает вызывающий: карточка появляется сразу. */
  onCreated(): void;
}

/**
 * Мастер создания пространства. Секреты живут в полях типа password и в
 * замыкании; в разметку, атрибуты и подсказки они не попадают.
 */
export class CreateSpaceModal extends Modal {
  private serverUrl = '';
  private token = '';
  private password = '';
  private repeat = '';
  private localFolder = '';
  private deviceLabel: string;
  private submit: ButtonComponent | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly deps: CreateSpaceModalDeps,
  ) {
    super(app);
    this.deviceLabel = app.vault.getName();
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('createSpace.title'));
    contentEl.addClass('vw-modal');

    textField(contentEl, 'createSpace.server.name', 'createSpace.server.desc', '', (value) => {
      this.serverUrl = value.trim();
    });
    secretField(contentEl, 'createSpace.token.name', 'createSpace.token.desc', (value) => {
      this.token = value;
    });
    secretField(contentEl, 'createSpace.password.name', 'createSpace.password.desc', (value) => {
      this.password = value;
    });
    secretField(
      contentEl,
      'createSpace.passwordRepeat.name',
      'createSpace.passwordRepeat.desc',
      (value) => {
        this.repeat = value;
      },
    );

    folderField(
      contentEl,
      this.app,
      'createSpace.folder.name',
      'createSpace.folder.desc',
      this.localFolder,
      (folder) => {
        this.localFolder = folder;
      },
    );

    textField(
      contentEl,
      'createSpace.device.name',
      'createSpace.device.desc',
      this.deviceLabel,
      (value) => {
        this.deviceLabel = value.trim();
      },
    );

    this.statusEl = contentEl.createDiv({ cls: 'vw-modal-status' });
    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('common.cancel')).onClick(() => {
      this.close();
    });
    const submit = new ButtonComponent(actions);
    this.submit = submit;
    submit
      .setButtonText(t('createSpace.submit'))
      .setCta()
      .onClick(() => {
        void this.run();
      });
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private input(): CreateSpaceInput {
    return {
      serverUrl: this.serverUrl,
      bootstrapToken: this.token.length > 0 ? this.token : this.deps.savedToken,
      password: this.password,
      localFolder: this.localFolder,
      deviceLabel: this.deviceLabel,
      label: connectionLabel(this.localFolder),
    };
  }

  private async run(): Promise<void> {
    const input = this.input();
    const problem = validateCreateSpace(input, this.repeat, this.deps.settings.connections);
    if (problem !== null) {
      this.statusEl?.setText(t(problem));
      return;
    }
    this.submit?.setDisabled(true);
    this.statusEl?.setText(t('createSpace.creating'));
    try {
      const result = await createSpaceConnection(input, {
        ...this.deps,
        files: this.app.vault.getFiles(),
        progress: (done, total) => {
          this.statusEl?.setText(t('createSpace.progress', { done, total }));
        },
      });
      this.deps.onCreated();
      this.close();
      new Notice(
        result.ok
          ? t('createSpace.done', { count: result.pushed })
          : t('error.startFailed', { reason: t(failureKey(result.failure)) }),
      );
    } catch (error) {
      this.submit?.setDisabled(false);
      this.statusEl?.setText(t('error.createFailed', { reason: errorText(error) }));
    }
  }
}
