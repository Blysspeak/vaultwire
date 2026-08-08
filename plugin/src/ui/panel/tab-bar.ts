import { t } from '../../i18n/ru';
import { PANEL_TABS } from './types';
import type { PanelTab } from './types';

/** Полоса вкладок панели. Кнопки создаются один раз, дальше меняются только классы. */
export interface TabBar {
  readonly el: HTMLElement;
  update(active: PanelTab, visible: (tab: PanelTab) => boolean): void;
}

export function createTabBar(parent: HTMLElement, onSelect: (tab: PanelTab) => void): TabBar {
  const el = parent.createDiv({ cls: 'vw-panel-tabs' });
  const buttons = new Map<PanelTab, HTMLElement>();
  for (const tab of PANEL_TABS) {
    const button = el.createEl('button', { cls: 'vw-panel-tab', text: t(`panel.tab.${tab}`) });
    // Слушатель уходит вместе с элементом: панель чистит разметку через empty().
    button.addEventListener('click', () => {
      onSelect(tab);
    });
    buttons.set(tab, button);
  }

  const update = (active: PanelTab, visible: (tab: PanelTab) => boolean): void => {
    for (const [tab, button] of buttons) {
      button.toggle(visible(tab));
      button.toggleClass('is-active', tab === active);
    }
  };

  return { el, update };
}
