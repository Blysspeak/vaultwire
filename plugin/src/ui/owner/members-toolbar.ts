import { ButtonComponent } from 'obsidian';
import { t } from '../../i18n/ru';

export interface ToolbarActions {
  refresh(): void;
  invite(): void;
  deleteSpace(): void;
}

/**
 * Панель действий вкладки участников. Снос пространства стоит последним и помечен
 * как опасное действие: рядом с обычными кнопками промах по нему стоил бы дорого.
 */
export function renderMembersToolbar(root: HTMLElement, actions: ToolbarActions): void {
  const toolbar = root.createDiv({ cls: 'vw-members-toolbar' });
  new ButtonComponent(toolbar).setButtonText(t('members.refresh')).onClick(() => {
    actions.refresh();
  });
  new ButtonComponent(toolbar)
    .setButtonText(t('members.invite'))
    .setCta()
    .onClick(() => {
      actions.invite();
    });
  new ButtonComponent(toolbar)
    .setButtonText(t('deleteSpace.action'))
    .setWarning()
    .onClick(() => {
      actions.deleteSpace();
    });
}
