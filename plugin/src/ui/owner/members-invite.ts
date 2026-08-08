import { ROLES } from '@vaultwire/shared';
import type { Role, SpaceId } from '@vaultwire/shared';
import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { VaultwireClient } from '../../api/client';
import { t } from '../../i18n/ru';
import type { MessageKey } from '../../i18n/ru';
import { buildConnectionCode } from '../connect/code';
import { errorText, formatMoment } from '../format';

const HOUR = 60 * 60 * 1000;

/** Сроки жизни инвайта: словарь длиннее нужного никому не помогает. */
const TTL_OPTIONS: ReadonlyArray<readonly [ms: number, label: MessageKey]> = [
  [HOUR, 'invite.ttl.hour'],
  [24 * HOUR, 'invite.ttl.day'],
  [7 * 24 * HOUR, 'invite.ttl.week'],
  [30 * 24 * HOUR, 'invite.ttl.month'],
];

export interface InviteDeps {
  readonly client: VaultwireClient;
  readonly spaceId: SpaceId;
  readonly serverUrl: string;
}

/**
 * Выпуск инвайта. Код подключения показывается один раз и в разметку не
 * попадает: он живёт в замыкании и уходит в буфер обмена по кнопке.
 */
export class InviteModal extends Modal {
  private role: Role = 'rw';
  private expiresIn: number = 7 * 24 * HOUR;
  private maxUses = 1;
  private code: string | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly deps: InviteDeps,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('invite.title'));
    contentEl.addClass('vw-modal');

    new Setting(contentEl)
      .setName(t('invite.role.name'))
      .setDesc(t('invite.role.desc'))
      .addDropdown((dropdown) => {
        for (const role of ROLES) dropdown.addOption(role, t(`role.${role}`));
        dropdown.setValue(this.role);
        dropdown.onChange((value) => {
          this.role = ROLES.find((role) => role === value) ?? this.role;
        });
      });

    new Setting(contentEl)
      .setName(t('invite.ttl.name'))
      .setDesc(t('invite.ttl.desc'))
      .addDropdown((dropdown) => {
        for (const [ms, label] of TTL_OPTIONS) dropdown.addOption(String(ms), t(label));
        dropdown.setValue(String(this.expiresIn));
        dropdown.onChange((value) => {
          this.expiresIn = Number(value);
        });
      });

    new Setting(contentEl)
      .setName(t('invite.uses.name'))
      .setDesc(t('invite.uses.desc'))
      .addSlider((slider) => {
        slider.setLimits(1, 20, 1).setValue(this.maxUses).setDynamicTooltip();
        slider.onChange((value) => {
          this.maxUses = value;
        });
      });

    this.statusEl = contentEl.createDiv({ cls: 'vw-modal-status' });
    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('common.cancel')).onClick(() => {
      this.close();
    });
    const issue = new ButtonComponent(actions);
    issue
      .setButtonText(t('invite.submit'))
      .setCta()
      .onClick(() => {
        void this.issue(issue, actions);
      });
  }

  override onClose(): void {
    this.code = null;
    this.contentEl.empty();
  }

  private async issue(button: ButtonComponent, actions: HTMLElement): Promise<void> {
    button.setDisabled(true);
    try {
      const invite = await this.deps.client.createInvite(this.deps.spaceId, {
        role: this.role,
        expiresIn: this.expiresIn,
        maxUses: this.maxUses,
      });
      this.code = buildConnectionCode({
        u: this.deps.serverUrl,
        s: this.deps.spaceId,
        i: invite.code,
      });
      this.statusEl?.setText(`${t('invite.ready')} ${t('invite.expires', { date: formatMoment(invite.expiresAt) })}`);
      new ButtonComponent(actions)
        .setButtonText(t('invite.copy'))
        .setCta()
        .onClick(() => {
          void this.copy();
        });
    } catch (error) {
      button.setDisabled(false);
      this.statusEl?.setText(`${t('invite.failed')} ${errorText(error)}`);
    }
  }

  private async copy(): Promise<void> {
    const code = this.code;
    if (code === null) return;
    try {
      await navigator.clipboard.writeText(code);
      new Notice(t('notice.codeCopied'));
    } catch {
      new Notice(t('notice.copyFailed'));
    }
  }
}
