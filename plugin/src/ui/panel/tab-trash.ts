import type { SpaceId } from '@vaultwire/shared';
import type { TrashItem } from '../../history/trash';
import { t } from '../../i18n/ru';
import type { ConnectionStatus } from '../../sync/status';
import { actionButton, formatMoment, formatSize, joinMeta, list, listItem, note } from './render';
import type { PanelHost, PanelTabView } from './types';

/**
 * Вкладка корзины. Список тянется с сервера по требованию, а не в фоне:
 * каждое надгробие стоит запроса истории, и в опросе ему делать нечего.
 */
export function createTrashTab(host: PanelHost): PanelTabView {
  const el = createDiv({ cls: 'vw-tab' });
  const body = list(el);
  const message = note(el, t('trash.loading'));
  let connections: readonly ConnectionStatus[] = [];
  let mounted = '';
  let loading = false;

  async function reload(): Promise<void> {
    if (loading) return;
    loading = true;
    mounted = keysOf(connections);
    body.empty();
    message.setText(t('trash.loading'));
    message.toggle(true);
    let count = 0;
    try {
      for (const connection of connections) {
        for (const item of await host.trash(connection.spaceId)) {
          count += 1;
          renderTrashItem(body, connection.spaceId, item, host, reload);
        }
      }
      message.setText(t('trash.empty'));
      message.toggle(count === 0);
    } catch {
      message.setText(t('trash.failed'));
      message.toggle(true);
    } finally {
      loading = false;
    }
  }

  return {
    el,
    update: (status): void => {
      connections = status.connections;
      // Подключение добавили или убрали, пока вкладка открыта.
      if (mounted !== '' && mounted !== keysOf(connections)) void reload();
    },
    activate: (): void => {
      void reload();
    },
  };
}

function renderTrashItem(
  parent: HTMLElement,
  spaceId: SpaceId,
  item: TrashItem,
  host: PanelHost,
  reload: () => Promise<void>,
): void {
  const parts = listItem(parent, item.path ?? t('trash.unknownPath'));
  parts.meta.setText(
    joinMeta([formatSize(item.size), t('trash.deletedAt', { when: formatMoment(item.deletedAt) })]),
  );
  const button = actionButton(parts.actions, t('trash.restore'), async () => {
    await host.restore(spaceId, item);
    await reload();
  });
  // Без живой ревизии восстанавливать нечего: тело уже собрано сборщиком мусора.
  button.setDisabled(item.restoreRev === null || item.path === null);
}

function keysOf(connections: readonly ConnectionStatus[]): string {
  return connections.map((item) => item.spaceId).join('|');
}
