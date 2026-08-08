import { ButtonComponent, Modal, type App } from 'obsidian';
import type { RequestFn } from '../../api/http';
import { t } from '../../i18n/ru';
import type { RingLog } from '../../log';
import type { ConnectionSettings } from '../../settings/types';
import type { VaultReader } from '../../sync/types';
import type { ExistingConnection } from './folder-rules';
import type { ActivatedInvite } from './join';
import { stepBack, stepForward } from './navigate';
import { PlanPreviewModal } from './preview';
import { initialState } from './state';
import type { StepHost } from './state';
import { renderCodeStep } from './step-code';
import { folderLabel, renderFolderStep } from './step-folder';
import { renderPasswordStep } from './step-password';
import { submitPassword } from './submit';
import type { SubmitOk } from './submit';

export interface ConnectWizardDeps {
  readonly app: App;
  readonly request: RequestFn;
  /** Метка этого устройства в списке участников пространства. */
  readonly deviceLabel: string;
  readonly existing: () => readonly ExistingConnection[];
  readonly reader: VaultReader;
  readonly maxFileBytes: () => number;
  /** Вызывается только после подтверждения плана: папка, настройки, старт. */
  readonly onApply: (settings: ConnectionSettings, password: string) => Promise<void>;
  readonly log: RingLog;
}

/** Мастер подключения раздела 8: код, папка, пароль, затем предпросмотр плана. */
export class ConnectWizard extends Modal {
  private readonly state = initialState();
  private joined: ActivatedInvite | null = null;

  constructor(private readonly deps: ConnectWizardDeps) {
    super(deps.app);
  }

  override onOpen(): void {
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('vw-modal');
    this.setTitle(t('connect.title'));
    const host: StepHost = {
      app: this.app,
      state: this.state,
      existing: () => this.deps.existing(),
      refresh: () => {
        this.render();
      },
    };
    if (this.state.step === 'code') renderCodeStep(root, host);
    else if (this.state.step === 'folder') renderFolderStep(root, host);
    else renderPasswordStep(root, host);
    if (this.state.error !== null) root.createDiv({ cls: 'vw-error', text: this.state.error });
    this.renderButtons(root);
  }

  private renderButtons(root: HTMLElement): void {
    const row = root.createDiv({ cls: 'modal-button-container' });
    if (this.state.step !== 'code') {
      new ButtonComponent(row)
        .setButtonText(t('connect.back'))
        .setDisabled(this.state.busy)
        .onClick(() => {
          this.back();
        });
    }
    new ButtonComponent(row)
      .setButtonText(t('connect.cancel'))
      .setDisabled(this.state.busy)
      .onClick(() => {
        this.close();
      });
    const last = this.state.step === 'password';
    new ButtonComponent(row)
      .setButtonText(last ? t('connect.password.check') : t('connect.next'))
      .setCta()
      .setDisabled(this.state.busy)
      .onClick(() => {
        if (last) void this.submit();
        else this.advance();
      });
  }

  private back(): void {
    stepBack(this.state);
    this.render();
  }

  private advance(): void {
    stepForward(this.state, this.deps.existing());
    this.render();
  }

  private async submit(): Promise<void> {
    this.state.busy = true;
    this.state.error = null;
    this.render();
    const result = await submitPassword(this.state, {
      request: this.deps.request,
      deviceLabel: this.deps.deviceLabel,
      reader: this.deps.reader,
      maxFileBytes: this.deps.maxFileBytes,
      log: this.deps.log,
      joined: this.joined,
    });
    this.joined = result.joined;
    this.state.busy = false;
    if (!result.ok) {
      this.state.error = result.error;
      this.render();
      return;
    }
    this.showPreview(result);
  }

  private showPreview(result: SubmitOk): void {
    const password = this.state.password;
    const settings = result.settings;
    this.close();
    new PlanPreviewModal({
      app: this.app,
      summary: result.summary,
      folder: folderLabel(settings.localFolder),
      skipped: result.skipped,
      onConfirm: () => {
        void this.deps.onApply(settings, password);
      },
    }).open();
  }
}

export function openConnectWizard(deps: ConnectWizardDeps): void {
  new ConnectWizard(deps).open();
}
