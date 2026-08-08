import type { DeviceId, DeviceSummary } from '@vaultwire/shared';
import { ButtonComponent } from 'obsidian';
import { t } from '../../i18n/ru';
import { formatMoment } from '../format';

export interface RowActions {
  revoke(device: DeviceSummary): void;
  rename(device: DeviceSummary): void;
}

/**
 * Строка таблицы участников. Переименование доступно только своему устройству:
 * протокол раздела 3 не знает эндпоинта смены чужой метки, метка хранится
 * локально и уходит в метаданные документов этого устройства.
 */
export function renderDeviceRow(
  list: HTMLElement,
  device: DeviceSummary,
  ownDeviceId: DeviceId,
  actions: RowActions,
): void {
  const own = device.deviceId === ownDeviceId;
  const revoked = device.revokedAt !== null;
  const row = list.createDiv({ cls: 'vw-member' });

  const head = row.createDiv({ cls: 'vw-member-head' });
  head.createSpan({ cls: 'vw-member-label', text: device.label });
  if (own) head.createSpan({ cls: 'vw-badge', text: t('members.thisDevice') });
  if (revoked) head.createSpan({ cls: 'vw-badge', text: t('members.revoked') });

  const meta = row.createDiv({ cls: 'vw-member-meta' });
  meta.createSpan({ text: t(`role.${device.role}`) });
  meta.createSpan({
    text: `${t('members.column.lastSeen')}: ${formatMoment(device.lastSeenAt)}`,
  });

  const buttons = row.createDiv({ cls: 'vw-member-actions' });
  if (own) {
    new ButtonComponent(buttons).setButtonText(t('members.rename')).onClick(() => {
      actions.rename(device);
    });
    return;
  }
  if (revoked) return;
  new ButtonComponent(buttons)
    .setButtonText(t('members.revoke'))
    .setWarning()
    .onClick(() => {
      actions.revoke(device);
    });
}
