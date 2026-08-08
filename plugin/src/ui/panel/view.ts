import type { SpaceId } from '@vaultwire/shared';
import { ItemView, type IconName, type WorkspaceLeaf } from 'obsidian';
import { t } from '../../i18n/ru';
import type { SyncStatus } from '../../sync/status';
import { pickConnection, resolveActive, scopeStatus } from './scope';
import { VW_PANEL_VIEW_TYPE } from './types';
import type { PanelHost, PanelTab, PanelTabView } from './types';
import { createParts } from './view-parts';
import type { PanelParts } from './view-parts';
import { createTab, tabVisible } from './view-tabs';

const PANEL_ICON: IconName = 'refresh-cw';

/**
 * Боковая панель: шапка активного подключения и вкладки под ней. Перерисовка
 * точечная — на событие состояния правятся только тексты шапки и активная
 * вкладка, разметка пересобирается лишь при смене подключения или вкладки.
 */
export class VaultwirePanelView extends ItemView {
  private readonly tabs = new Map<PanelTab, PanelTabView>();
  private parts: PanelParts | null = null;
  private active: PanelTab = 'activity';
  private space: SpaceId | null = null;
  private status: SyncStatus;
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: PanelHost,
  ) {
    super(leaf);
    // Панель не открывает файлы и никуда не уводит.
    this.navigation = false;
    this.status = host.status();
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
    this.parts = createParts(root, this.host.actions, {
      pick: (spaceId) => {
        this.pick(spaceId);
      },
      select: (tab) => {
        this.select(tab);
      },
    });
    this.unsubscribe = this.host.subscribe((status) => {
      this.apply(status);
    });
  }

  protected override async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dropTabs();
    this.parts = null;
    this.contentEl.empty();
  }

  /** Открытие на нужной вкладке: команда «показать конфликты» и строка состояния. */
  select(tab: PanelTab): void {
    this.active = tab;
    this.parts?.bar.update(tab, (item) => this.visible(item));
    this.mount();
  }

  private pick(spaceId: SpaceId): void {
    if (spaceId === this.space) return;
    this.space = spaceId;
    this.dropTabs();
    this.apply(this.status);
  }

  private apply(status: SyncStatus): void {
    this.status = status;
    const next = resolveActive(status, this.space);
    if (next !== this.space) {
      this.space = next;
      this.dropTabs();
    }
    const parts = this.parts;
    if (parts === null) return;
    parts.header.update(status, this.space);
    parts.empty.el.toggle(this.space === null);
    parts.empty.update();
    parts.bar.el.toggle(this.space !== null);
    if (!this.visible(this.active)) this.active = 'activity';
    parts.bar.update(this.active, (tab) => this.visible(tab));
    this.mount();
  }

  /**
   * Смонтированная вкладка получает свежее состояние; пересборка тела нужна
   * только когда вкладка сменилась или её создали заново.
   */
  private mount(): void {
    const parts = this.parts;
    if (parts === null) return;
    const view = this.space === null ? null : this.ensure(this.active, this.space);
    if (view === null) {
      parts.body.empty();
      return;
    }
    const scoped = scopeStatus(this.status, this.space);
    if (view.el.parentElement === parts.body) {
      view.update(scoped);
      return;
    }
    parts.body.empty();
    parts.body.appendChild(view.el);
    view.update(scoped);
    view.activate?.();
  }

  private visible(tab: PanelTab): boolean {
    return tabVisible(tab, pickConnection(this.status, this.space));
  }

  /** Вкладка создаётся один раз на подключение: переключение её не пересобирает. */
  private ensure(tab: PanelTab, spaceId: SpaceId): PanelTabView | null {
    const existing = this.tabs.get(tab);
    if (existing !== undefined) return existing;
    const created = createTab(tab, this.host, this.app, spaceId);
    if (created !== null) this.tabs.set(tab, created);
    return created;
  }

  /** Смена подключения: вкладки собраны под конкретное пространство. */
  private dropTabs(): void {
    for (const tab of this.tabs.values()) tab.dispose?.();
    this.tabs.clear();
    this.parts?.body.empty();
  }
}
