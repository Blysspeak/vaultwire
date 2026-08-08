import { Setting } from 'obsidian';
import { obsidianRequest } from '../api/request';
import { t } from '../i18n/ru';
import { CreateSpaceModal } from '../ui/owner/create-space';
import { requireManager } from './actions';
import type { ConnectionsDeps } from './actions';
import { renderConnectionsList } from './connections-list';

/**
 * Общая секция вкладки настроек: карточки подключений и две кнопки под ними.
 * Заголовка у секции нет по разделу 8, поэтому Setting.setHeading здесь не зовётся.
 */
export function renderConnectionsSection(root: HTMLElement, deps: ConnectionsDeps): void {
  renderConnectionsList(root, deps);

  new Setting(root)
    .setName(t('connect.open'))
    .setDesc(t('settings.connections.connectDesc'))
    .addButton((button) => {
      button.setButtonText(t('connect.open')).onClick(() => {
        deps.actions.connectSpace();
      });
    });

  // Создание доступно только при заданном bootstrap-токене сервера.
  if (deps.settings.bootstrapToken.length === 0) return;
  new Setting(root)
    .setName(t('settings.connections.create'))
    .setDesc(t('settings.connections.createDesc'))
    .addButton((button) => {
      button.setButtonText(t('settings.connections.create')).onClick(() => {
        openCreateSpace(deps);
      });
    });
}

function openCreateSpace(deps: ConnectionsDeps): void {
  const manager = requireManager(deps);
  if (manager === null) return;
  new CreateSpaceModal(deps.app, {
    request: obsidianRequest,
    settings: deps.settings,
    manager,
    savedToken: deps.settings.bootstrapToken,
    save: () => deps.save(),
    onCreated: () => {
      deps.refresh();
    },
  }).open();
}
