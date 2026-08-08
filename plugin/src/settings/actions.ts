import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { SyncManager } from '../sync';
import type { VaultwireSettings } from './types';

/**
 * Чего вкладка настроек и панель не умеют сами: реестр подключений живёт в
 * плагине, а собирает его main.ts. Отсутствующий реестр не ломает разметку:
 * справка о подключениях рисуется и без движка.
 */
export interface SettingsActions {
  /** Реестр подключений; null — движок ещё не поднят. */
  manager(): SyncManager | null;
}

/** Заглушка на время, пока main.ts не связал вкладку с движком. */
export const NO_ACTIONS: SettingsActions = {
  manager: () => null,
};

/** Общий контекст карточек подключений. */
export interface ConnectionsDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly actions: SettingsActions;
  save(): Promise<void>;
  /** Перерисовать поверхности плагина: состав подключений мог измениться. */
  refresh(): void;
}

/** Реестр или предупреждение вместо действия: движок поднимается не сразу. */
export function requireManager(deps: ConnectionsDeps): SyncManager | null {
  const manager = deps.actions.manager();
  if (manager === null) new Notice(t('notice.engineNotReady'));
  return manager;
}
