import type { SpaceId } from '@vaultwire/shared';
import { t } from '../../i18n/ru';
import { renderConnectionCard } from './activity-card';
import type { ConnectionCard } from './activity-card';
import { renderActivityLists } from './activity-lists';
import { note } from './render';
import type { PanelHost, PanelTabView } from './types';

/**
 * Вкладка активности: карточка на подключение, последние операции и проблемные
 * документы. Карточки живут между обновлениями и правят только свой текст.
 */
export function createActivityTab(host: PanelHost): PanelTabView {
  const el = createDiv({ cls: 'vw-tab' });
  const cardsHost = el.createDiv({ cls: 'vw-cards' });
  const empty = note(el, t('panel.empty'));
  const lists = renderActivityLists(el, host);
  const cards = new Map<SpaceId, ConnectionCard>();
  let mounted = '';

  return {
    el,
    update: (status): void => {
      const keys = status.connections.map((item) => item.spaceId).join('|');
      if (keys === mounted) {
        for (const item of status.connections) cards.get(item.spaceId)?.update(item);
      } else {
        mounted = keys;
        cards.clear();
        cardsHost.empty();
        for (const item of status.connections) {
          cards.set(item.spaceId, renderConnectionCard(cardsHost, item, host));
        }
      }
      empty.toggle(status.connections.length === 0);
      lists.update(status);
    },
  };
}
