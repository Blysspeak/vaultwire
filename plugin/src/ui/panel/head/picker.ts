import type { SpaceId } from '@vaultwire/shared';
import { t } from '../../../i18n/ru';
import type { ConnectionStatus } from '../../../sync/status';

/**
 * Выбор активного подключения. Одно подключение — просто его метка: выпадающий
 * список из одной строки только притворяется выбором.
 */
export interface ConnectionPicker {
  update(connections: readonly ConnectionStatus[], active: SpaceId | null): void;
}

export function createPicker(
  parent: HTMLElement,
  onPick: (spaceId: SpaceId) => void,
): ConnectionPicker {
  const root = parent.createDiv({ cls: 'vw-head-picker' });
  const label = root.createSpan({ cls: 'vw-head-label' });
  const select = root.createEl('select', { cls: 'vw-head-select' });
  select.setAttr('aria-label', t('panel.pick'));
  select.addEventListener('change', () => {
    onPick(select.value as SpaceId);
  });

  // Список опций пересобирается только при смене состава подключений: смена
  // состояния приходит пачками, а перерисовка select сбрасывала бы выбор.
  let mounted = '';

  const update = (connections: readonly ConnectionStatus[], active: SpaceId | null): void => {
    const many = connections.length > 1;
    select.toggle(many);
    label.toggle(!many);
    const current = pickConnection(connections, active);
    label.setText(current === null ? '' : nameOf(current));
    if (!many) return;
    const keys = connections.map((item) => `${item.spaceId}:${item.label}`).join('|');
    if (keys !== mounted) {
      mounted = keys;
      select.empty();
      for (const item of connections) {
        select.createEl('option', { value: item.spaceId, text: nameOf(item) });
      }
    }
    if (active !== null) select.value = active;
  };

  return { update };
}

function pickConnection(
  connections: readonly ConnectionStatus[],
  active: SpaceId | null,
): ConnectionStatus | null {
  return connections.find((item) => item.spaceId === active) ?? null;
}

/** Без метки остаётся идентификатор: пустая строка в списке ничего не выбирает. */
function nameOf(connection: ConnectionStatus): string {
  return connection.label.length > 0 ? connection.label : connection.spaceId;
}
