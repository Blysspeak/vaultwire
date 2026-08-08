import type { App, Plugin } from 'obsidian';
import type { SyncManager } from '../sync';
import { createPanelHost } from './panel-host';
import { openPanel } from './panel-open';
import type { ConflictRegistries } from './registries';
import type { StatusStore } from '../ui/panel/store';
import { VaultwireStatusBar } from '../ui/panel/status-bar';
import { VW_PANEL_VIEW_TYPE } from '../ui/panel/types';
import { VaultwirePanelView } from '../ui/panel/view';

export interface SurfaceDeps {
  readonly app: App;
  readonly plugin: Plugin;
  readonly store: StatusStore;
  readonly registries: ConflictRegistries;
  manager(): SyncManager | null;
}

/** Строка состояния: подписка снимается вместе с плагином через register. */
export function mountStatusBar(deps: SurfaceDeps): void {
  const el = deps.plugin.addStatusBarItem();
  const bar = new VaultwireStatusBar(el);
  deps.plugin.registerDomEvent(el, 'click', () => {
    void openPanel(deps.app);
  });
  deps.plugin.register(
    deps.store.subscribe((status) => {
      bar.render(status);
    }),
  );
}

/** Фабрика, а не готовый вид: ссылку на созданный лист плагин не держит. */
export function mountPanel(deps: SurfaceDeps): void {
  const host = createPanelHost({
    app: deps.app,
    manager: deps.manager,
    store: deps.store,
    registries: deps.registries,
  });
  deps.plugin.registerView(VW_PANEL_VIEW_TYPE, (leaf) => new VaultwirePanelView(leaf, host));
}
