import type { SpaceId } from '@vaultwire/shared';
import { Platform } from 'obsidian';
import { createEmptyState } from './empty-state';
import type { EmptyState } from './empty-state';
import { renderFooter } from './footer';
import { createHeader } from './head/header';
import type { PanelHeader } from './head/header';
import { createTabBar } from './tab-bar';
import type { TabBar } from './tab-bar';
import type { PanelActions, PanelTab } from './types';

/** Части панели: шапка, пустое состояние, вкладки и прокручиваемое тело. */
export interface PanelParts {
  readonly header: PanelHeader;
  readonly empty: EmptyState;
  readonly bar: TabBar;
  readonly body: HTMLElement;
}

export interface PartsHandlers {
  pick(spaceId: SpaceId): void;
  select(tab: PanelTab): void;
}

/** Порядок разметки задан здесь: шапка сверху, ссылка на настройки внизу. */
export function createParts(
  root: HTMLElement,
  actions: PanelActions,
  handlers: PartsHandlers,
): PanelParts {
  // На телефоне значки крупнее, а метка подключения занимает всю строку:
  // кнопки шапки переносятся ниже вместо того, чтобы сжиматься в кашу.
  root.toggleClass('vw-phone', Platform.isPhone);
  const header = createHeader(root, actions, (spaceId) => {
    handlers.pick(spaceId);
  });
  const empty = createEmptyState(root, actions);
  const bar = createTabBar(root, (tab) => {
    handlers.select(tab);
  });
  const body = root.createDiv({ cls: 'vw-panel-body' });
  renderFooter(root, () => {
    actions.openPluginSettings();
  });
  return { header, empty, bar, body };
}
