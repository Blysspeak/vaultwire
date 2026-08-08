import type { DocId, SpaceId } from '@vaultwire/shared';
import type { ConflictRecord } from '../../conflicts/registry-file';
import type { TrashItem } from '../../history/trash';
import type { SyncStatus } from '../../sync/status';
import type { RunReport } from '../../sync/types';

/** Тип листа боковой панели, он же ключ в registerView. */
export const VW_PANEL_VIEW_TYPE = 'vw-panel';

export const PANEL_TABS = ['activity', 'conflicts', 'trash'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/**
 * Всё, что панели нужно от плагина. Отдельный интерфейс, а не ссылка на класс
 * плагина: панель не должна знать ни о реестре подключений, ни о клиенте.
 */
export interface PanelHost {
  status(): SyncStatus;
  /** Подписка на агрегированное состояние; возвращает отписку. */
  subscribe(listener: (status: SyncStatus) => void): () => void;
  /** Итог последнего прогона: очередь, применённые операции, проблемы. */
  report(spaceId: SpaceId): RunReport | null;
  syncNow(spaceId?: SpaceId): Promise<void>;
  pause(spaceId: SpaceId): void;
  resume(spaceId: SpaceId): void;
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
  /** Точечная перерисовка по свежему агрегированному состоянию. */
  update(status: SyncStatus): void;
  /** Вкладка стала видимой: данные, которые тянутся по требованию. */
  activate?(): void;
  dispose?(): void;
}
