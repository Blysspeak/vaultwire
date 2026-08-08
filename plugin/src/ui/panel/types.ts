import type { DocId, SpaceId } from '@vaultwire/shared';
import type { ConflictRecord } from '../../conflicts/registry-file';
import type { TrashItem } from '../../history/trash';
import type { SyncStatus } from '../../sync/status';
import type { RunReport } from '../../sync/types';

/** Тип листа боковой панели, он же ключ в registerView. */
export const VW_PANEL_VIEW_TYPE = 'vw-panel';

/** Участники показываются только владельцу: видимость решает сама панель. */
export const PANEL_TABS = ['activity', 'conflicts', 'trash', 'members'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/**
 * Управление подключениями из панели. Мастера и модальные окна живут в app-слое:
 * панель их только зовёт и ничего не знает ни о настройках, ни о клиенте.
 */
export interface PanelActions {
  /** Bootstrap-токен задан: без него создание пространства недоступно. */
  canCreateSpace(): boolean;
  connectSpace(): void;
  createSpace(): void;
  /** Ручной прогон одного подключения. */
  sync(spaceId: SpaceId): void;
  /** Пауза переживает перезапуск: вместе с реестром правится флаг autoSync. */
  setPaused(spaceId: SpaceId, paused: boolean): void;
  /** Модальное окно настроек подключения. */
  configure(spaceId: SpaceId): void;
  /** Отключение с подтверждением набора идентификатора. */
  disconnect(spaceId: SpaceId): void;
  /** Вкладка настроек плагина. */
  openPluginSettings(): void;
  /** Вкладка участников; null — подключения уже нет или движок не поднят. */
  createMembersTab(spaceId: SpaceId): PanelTabView | null;
}

/**
 * Всё, что панели нужно от плагина. Отдельный интерфейс, а не ссылка на класс
 * плагина: панель не должна знать ни о реестре подключений, ни о клиенте.
 */
export interface PanelHost {
  readonly actions: PanelActions;
  status(): SyncStatus;
  /** Подписка на агрегированное состояние; возвращает отписку. */
  subscribe(listener: (status: SyncStatus) => void): () => void;
  /** Итог последнего прогона: очередь, применённые операции, проблемы. */
  report(spaceId: SpaceId): RunReport | null;
  /** Автор последней правки файла по пути от корня хранилища; null — неизвестен. */
  author(spaceId: SpaceId, vaultFilePath: string): string | null;
  /** Повтор одного проблемного документа. */
  retry(spaceId: SpaceId, docId: string): Promise<void>;
  conflicts(spaceId: SpaceId): readonly ConflictRecord[];
  keepMine(spaceId: SpaceId, docId: DocId): Promise<void>;
  keepServer(spaceId: SpaceId, docId: DocId): Promise<void>;
  trash(spaceId: SpaceId): Promise<readonly TrashItem[]>;
  /** Путь от корня хранилища вычисляет плагин: панель о папке подключения не знает. */
  restore(spaceId: SpaceId, item: TrashItem): Promise<void>;
}

/**
 * Вкладка панели. Корневой элемент создаётся один раз и переиспользуется:
 * переключение вкладок не должно пересобирать разметку заново.
 */
export interface PanelTabView {
  readonly el: HTMLElement;
  /** Точечная перерисовка по свежему состоянию активного подключения. */
  update(status: SyncStatus): void;
  /** Вкладка стала видимой: данные, которые тянутся по требованию. */
  activate?(): void;
  dispose?(): void;
}
