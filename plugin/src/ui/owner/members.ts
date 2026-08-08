import { canAdmin } from '@vaultwire/shared';
import type { DeviceSummary } from '@vaultwire/shared';
import { ButtonComponent, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { VaultwireClient } from '../../api/client';
import { t } from '../../i18n/ru';
import type { RingLog } from '../../log';
import type { ConnectionSettings } from '../../settings/types';
import type { PanelTabView } from '../panel/types';
import { ConfirmModal } from '../confirm';
import { errorText } from '../format';
import { PromptModal } from '../prompt';
import { InviteModal } from './members-invite';
import { renderDeviceRow } from './members-row';

export interface MembersDeps {
  readonly app: App;
  readonly client: VaultwireClient;
  /** Подключение владельца: spaceId, адрес сервера, своё устройство и его метка. */
  readonly connection: ConnectionSettings;
  readonly log: RingLog;
  save(): Promise<void>;
}

/**
 * Вкладка панели «участники», видна только владельцу. Список устройств тянется
 * по требованию: он нужен редко, а держать его свежим фоном смысла нет.
 */
export class MembersTab implements PanelTabView {
  readonly el: HTMLElement;
  private readonly listEl: HTMLElement;

  constructor(private readonly deps: MembersDeps) {
    this.el = createDiv({ cls: 'vw-members' });
    const toolbar = this.el.createDiv({ cls: 'vw-members-toolbar' });
    new ButtonComponent(toolbar).setButtonText(t('members.refresh')).onClick(() => {
      void this.refresh();
    });
    new ButtonComponent(toolbar)
      .setButtonText(t('members.invite'))
      .setCta()
      .onClick(() => {
        this.openInvite();
      });
    this.listEl = this.el.createDiv({ cls: 'vw-members-list' });
  }

  /** Состав участников от прогонов синхронизации не зависит. */
  update(): void {}

  activate(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const list = this.listEl;
    list.empty();
    if (!canAdmin(this.deps.connection.role)) {
      list.createDiv({ cls: 'vw-empty', text: t('members.notOwner') });
      return;
    }
    list.createDiv({ cls: 'vw-empty', text: t('common.loading') });
    try {
      this.render(await this.deps.client.listDevices(this.deps.connection.spaceId));
    } catch (error) {
      this.deps.log.warn('members', 'список устройств не пришёл', { reason: errorText(error) });
      list.empty();
      list.createDiv({ cls: 'vw-empty', text: t('members.loadFailed') });
    }
  }

  private render(devices: readonly DeviceSummary[]): void {
    const list = this.listEl;
    list.empty();
    if (devices.length === 0) {
      list.createDiv({ cls: 'vw-empty', text: t('members.empty') });
      return;
    }
    const actions = {
      revoke: (device: DeviceSummary): void => {
        this.confirmRevoke(device);
      },
      rename: (): void => {
        this.openRename();
      },
    };
    for (const device of devices) {
      renderDeviceRow(list, device, this.deps.connection.deviceId, actions);
    }
  }

  private openInvite(): void {
    new InviteModal(this.deps.app, {
      client: this.deps.client,
      spaceId: this.deps.connection.spaceId,
      serverUrl: this.deps.connection.serverUrl,
    }).open();
  }

  private confirmRevoke(device: DeviceSummary): void {
    new ConfirmModal(
      this.deps.app,
      {
        title: t('revoke.title'),
        body: t('revoke.body', { label: device.label }),
        confirmText: t('members.revoke'),
      },
      () => {
        void this.revoke(device);
      },
    ).open();
  }

  private async revoke(device: DeviceSummary): Promise<void> {
    try {
      await this.deps.client.revokeDevice(this.deps.connection.spaceId, device.deviceId);
      new Notice(t('notice.deviceRevoked'));
      await this.refresh();
    } catch (error) {
      this.deps.log.error('members', 'отзыв не прошёл', { reason: errorText(error) });
      new Notice(t('notice.revokeFailed'));
    }
  }

  /** Метка своего устройства: локальная настройка, серверу она не пересылается. */
  private openRename(): void {
    new PromptModal(
      this.deps.app,
      { title: 'rename.title', name: 'rename.name', initial: this.deps.connection.deviceLabel },
      (value) => {
        this.deps.connection.deviceLabel = value;
        void this.deps.save().then(() => {
          new Notice(t('notice.renamed'));
          return this.refresh();
        });
      },
    ).open();
  }
}
