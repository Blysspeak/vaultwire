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

  // Создание требует bootstrap-токена сервера. Кнопка показывается всегда и
  // просто гаснет без токена: прятать её нельзя, потому что токен вводится ниже
  // на этой же странице, а вкладка настроек сама себя не перерисовывает, и
  // исчезнувшее действие выглядит как поломка.
  const hasToken = deps.settings.bootstrapToken.length > 0;
  new Setting(root)
    .setName(t('settings.connections.create'))
    .setDesc(hasToken ? t('settings.connections.createDesc') : t('settings.connections.createNeedsToken'))
    .addButton((button) => {
      button
        .setButtonText(t('settings.connections.create'))
        .setDisabled(!hasToken)
        .onClick(() => {
          if (!hasToken) return;
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
