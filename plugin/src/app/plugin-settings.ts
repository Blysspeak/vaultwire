import type { App } from 'obsidian';

/** Окно настроек Obsidian: в публичных типах его нет, а открыть вкладку можно только так. */
interface SettingWindow {
  open(): void;
  openTabById(id: string): void;
}

interface AppWithSetting extends App {
  readonly setting: SettingWindow;
}

/** Вкладка настроек плагина: ссылка из подвала панели. */
export function openPluginSettings(app: App, pluginId: string): void {
  const window = (app as AppWithSetting).setting;
  window.open();
  window.openTabById(pluginId);
}
