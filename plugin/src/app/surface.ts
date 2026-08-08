import type { App, Plugin } from 'obsidian';
import { t } from '../i18n/ru';
import { NoteBadge } from '../ui/note-badge';
import type { SyncManager } from '../sync';
import { createPanelHost } from './panel-host';
import { openPanel } from './panel-open';
import type { ConflictRegistries } from './registries';
import { activeFileStatus } from './status-file';
import type { StatusStore } from '../ui/panel/store';
import { VaultwireStatusBar } from '../ui/panel/status-bar';
import { VW_PANEL_VIEW_TYPE } from '../ui/panel/types';
import type { PanelActions } from '../ui/panel/types';
import { VaultwirePanelView } from '../ui/panel/view';

export interface SurfaceDeps {
  readonly app: App;
  readonly plugin: Plugin;
  readonly store: StatusStore;
  readonly registries: ConflictRegistries;
  /** Оперативные действия панели: подключение, создание, управление. */
  readonly actions: PanelActions;
  manager(): SyncManager | null;
}

/** Период освежения относительного времени в строке состояния, мс. */
const FILE_STATUS_REFRESH_MS = 15_000;

/**
 * Строка состояния: общее состояние и состояние открытой заметки. Подписки и
 * таймер снимаются вместе с плагином через register и registerInterval.
 */
export function mountStatusBar(deps: SurfaceDeps): void {
  const el = deps.plugin.addStatusBarItem();
  const bar = new VaultwireStatusBar(el);
  // Подпись у заголовка заметки: то же состояние, но там, куда человек смотрит.
  const badge = new NoteBadge(deps.app);
  const draw = (): void => {
    const file = activeFileStatus(deps.app, deps.manager());
    bar.render(deps.store.status, file);
    badge.update(file);
  };
  deps.plugin.registerDomEvent(el, 'click', () => {
    void openPanel(deps.app);
  });
  deps.plugin.register(deps.store.subscribe(draw));
  deps.plugin.registerEvent(deps.app.workspace.on('file-open', draw));
  // Смена вкладки шапку не перерисовывает: подпись живёт в каждой своей.
  deps.plugin.registerEvent(deps.app.workspace.on('active-leaf-change', draw));
  deps.plugin.register(() => {
    badge.clear();
  });
  // Без тика «5 минут назад» так и висело бы, пока не сдвинется состояние.
  deps.plugin.registerInterval(window.setInterval(draw, FILE_STATUS_REFRESH_MS));
}

/**
 * Иконка в ленте слева. Панель прячется в правой боковой области и без такой
 * кнопки находится только через палитру команд, что для ежедневного инструмента
 * слишком долго. Уборка автоматическая: элемент ленты снимается вместе с плагином.
 */
export function mountRibbon(deps: SurfaceDeps): void {
  deps.plugin.addRibbonIcon('cable', t('panel.ribbon'), () => {
    void openPanel(deps.app);
  });
}

/** Фабрика, а не готовый вид: ссылку на созданный лист плагин не держит. */
export function mountPanel(deps: SurfaceDeps): void {
  const host = createPanelHost({
    app: deps.app,
    manager: deps.manager,
    store: deps.store,
    registries: deps.registries,
    actions: deps.actions,
  });
  deps.plugin.registerView(VW_PANEL_VIEW_TYPE, (leaf) => new VaultwirePanelView(leaf, host));
}
