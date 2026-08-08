import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { SyncManager } from '../sync';
import type { VaultwireSettings } from './types';

/**
 * Чего вкладка настроек не умеет сама: реестр подключений и мастер подключения
 * живут в плагине, а собирает их main.ts. Отсутствующие действия не ломают
 * вкладку: она рисуется и без движка.
 */
export interface SettingsActions {
  /** Реестр подключений; null — движок ещё не поднят. */
  manager(): SyncManager | null;
  /** Мастер подключения к существующему пространству (ui/connect). */
  connectSpace(): void;
}

/** Заглушка на время, пока main.ts не связал вкладку с движком. */
export const NO_ACTIONS: SettingsActions = {
  manager: () => null,
  connectSpace: () => {
    new Notice(t('notice.connectNotReady'));
  },
};

/** Общий контекст карточек подключений. */
export interface ConnectionsDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly actions: SettingsActions;
  save(): Promise<void>;
  /** Перерисовать вкладку целиком: состав карточек мог измениться. */
  refresh(): void;
}

/** Реестр или предупреждение вместо действия: движок поднимается не сразу. */
export function requireManager(deps: ConnectionsDeps): SyncManager | null {
  const manager = deps.actions.manager();
  if (manager === null) new Notice(t('notice.engineNotReady'));
  return manager;
}
