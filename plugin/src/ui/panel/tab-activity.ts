import { renderActivityLists } from './activity-lists';
import type { PanelHost, PanelTabView } from './types';

/**
 * Вкладка активности: последние операции и проблемные документы активного
 * подключения. Состояние, счётчики и управление живут в шапке панели.
 */
export function createActivityTab(host: PanelHost): PanelTabView {
  const el = createDiv({ cls: 'vw-tab' });
  const lists = renderActivityLists(el, host);

  return {
    el,
    update: (status): void => {
      lists.update(status);
    },
  };
}
