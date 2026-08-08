import { t } from '../../i18n/ru';
import { actionButton, note } from './render';
import type { PanelActions } from './types';

/**
 * Пустое состояние панели. Кнопка создания видна всегда и просто гаснет без
 * bootstrap-токена: исчезающее действие читается как поломка.
 */
export interface EmptyState {
  readonly el: HTMLElement;
  update(): void;
}

export function createEmptyState(parent: HTMLElement, actions: PanelActions): EmptyState {
  const el = parent.createDiv({ cls: 'vw-panel-empty' });
  note(el, t('panel.empty.desc'));
  const buttons = el.createDiv({ cls: 'vw-panel-empty-actions' });
  actionButton(buttons, t('connect.open'), () => {
    actions.connectSpace();
  }).setCta();
  const create = actionButton(buttons, t('settings.connections.create'), () => {
    if (actions.canCreateSpace()) actions.createSpace();
  });
  const hint = note(el, t('panel.empty.needsToken'));

  const update = (): void => {
    const allowed = actions.canCreateSpace();
    create.setDisabled(!allowed);
    hint.toggle(!allowed);
  };

  update();
  return { el, update };
}
