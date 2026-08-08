import { ItemView, type IconName, type WorkspaceLeaf } from 'obsidian';
import { t } from '../../i18n/ru';
import { createActivityTab } from './tab-activity';
import { createConflictsTab } from './tab-conflicts';
import { createTrashTab } from './tab-trash';
import { PANEL_TABS, VW_PANEL_VIEW_TYPE } from './types';
import type { PanelHost, PanelTab, PanelTabView } from './types';

const PANEL_ICON: IconName = 'refresh-cw';

/** Боковая панель с вкладками активности, конфликтов и корзины (раздел 8). */
export class VaultwirePanelView extends ItemView {
  private readonly tabs = new Map<PanelTab, PanelTabView>();
  private readonly buttons = new Map<PanelTab, HTMLElement>();
  private body: HTMLElement | null = null;
  private active: PanelTab = 'activity';
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: PanelHost,
  ) {
    super(leaf);
    // Панель не открывает файлы и никуда не уводит.
    this.navigation = false;
  }

  override getViewType(): string {
    return VW_PANEL_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return t('panel.title');
  }

  override getIcon(): IconName {
    return PANEL_ICON;
  }

  protected override async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('vw-panel');
    this.renderTabBar(root);
    this.body = root.createDiv({ cls: 'vw-panel-body' });
    // Подписка на агрегированное состояние: обновляется только активная вкладка.
    this.unsubscribe = this.host.subscribe((status) => {
      this.tabs.get(this.active)?.update(status);
    });
    this.select(this.active);
  }

  protected override async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const tab of this.tabs.values()) tab.dispose?.();
    this.tabs.clear();
    this.buttons.clear();
    this.body = null;
    this.contentEl.empty();
  }

  /** Открытие на нужной вкладке: команда «показать конфликты» и клик по строке состояния. */
  select(tab: PanelTab): void {
    this.active = tab;
    for (const [name, button] of this.buttons) button.toggleClass('is-active', name === tab);
    const body = this.body;
    if (body === null) return;
    body.empty();
    const view = this.ensure(tab);
    body.appendChild(view.el);
    view.update(this.host.status());
    view.activate?.();
  }

  private renderTabBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: 'vw-panel-tabs' });
    for (const tab of PANEL_TABS) {
      const button = bar.createEl('button', {
        cls: 'vw-panel-tab',
        text: t(`panel.tab.${tab}`),
      });
      this.registerDomEvent(button, 'click', () => {
        this.select(tab);
      });
      this.buttons.set(tab, button);
    }
  }

  /** Вкладка создаётся один раз: переключение не пересобирает её разметку. */
  private ensure(tab: PanelTab): PanelTabView {
    const existing = this.tabs.get(tab);
    if (existing !== undefined) return existing;
    const created = this.create(tab);
    this.tabs.set(tab, created);
    return created;
  }

  private create(tab: PanelTab): PanelTabView {
    if (tab === 'conflicts') return createConflictsTab(this.host, this.app);
    if (tab === 'trash') return createTrashTab(this.host);
    return createActivityTab(this.host);
  }
}
