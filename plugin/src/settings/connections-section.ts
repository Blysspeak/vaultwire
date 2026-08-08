import { Setting } from 'obsidian';
import { openPanel } from '../app/panel-open';
import { t } from '../i18n/ru';
import type { ConnectionsDeps } from './actions';
import { renderConnectionsList } from './connections-list';

/**
 * Общая секция вкладки настроек: справка о подключениях и переход в панель.
 * Подключение, создание и управление живут в панели: она открыта постоянно, а
 * ходить за каждым действием в настройки слишком долго.
 */
export function renderConnectionsSection(root: HTMLElement, deps: ConnectionsDeps): void {
  renderConnectionsList(root, deps);

  new Setting(root)
    .setName(t('settings.openPanel'))
    .setDesc(t('settings.connections.managedInPanel'))
    .addButton((button) => {
      button
        .setButtonText(t('settings.openPanel'))
        .setCta()
        .onClick(() => {
          void openPanel(deps.app);
        });
    });
}
