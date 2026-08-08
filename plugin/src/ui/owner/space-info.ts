import type { VaultwireClient } from '../../api/client';
import { decryptMeta } from '../../crypto';
import type { KeyBundle } from '../../crypto';
import { t } from '../../i18n/ru';
import type { RingLog } from '../../log';
import type { ConnectionSettings } from '../../settings/types';
import { formatBytes } from '../connect/summary';
import { errorText, formatMoment } from '../format';

/** Сводка пространства из раздела 8: сколько документов, сколько весит, где счётчик. */
export interface SpaceInfo {
  readonly docCount: number;
  readonly bytes: number;
  readonly seq: number;
  /** mtime последнего изменения; null — метаданные недоступны без ключей. */
  readonly changedAt: number | null;
}

export interface SpaceInfoDeps {
  readonly client: VaultwireClient;
  readonly connection: ConnectionSettings;
  /** Ключи подключения; null — пароль не введён, метаданные не расшифровать. */
  keys(): KeyBundle | null;
  readonly log: RingLog;
}

export async function fetchSpaceInfo(deps: SpaceInfoDeps): Promise<SpaceInfo> {
  const space = await deps.client.getSpace(deps.connection.spaceId);
  return {
    docCount: space.docCount,
    bytes: space.bytes,
    seq: space.seq,
    changedAt: await lastChangedAt(deps, space.seq),
  };
}

/** Сводка карточкой: те же классы, что у карточки подключения. */
export function renderSpaceInfo(root: HTMLElement, info: SpaceInfo): void {
  root.empty();
  root.createDiv({ cls: 'vw-card-title', text: t('spaceInfo.heading') });
  const rows: ReadonlyArray<readonly [string, string]> = [
    [t('spaceInfo.docs'), String(info.docCount)],
    [t('spaceInfo.bytes'), formatBytes(info.bytes)],
    [t('spaceInfo.seq'), String(info.seq)],
    [
      t('spaceInfo.changedAt'),
      info.changedAt === null ? t('common.unknown') : formatMoment(info.changedAt),
    ],
  ];
  for (const [key, value] of rows) {
    const row = root.createDiv({ cls: 'vw-card-row' });
    row.createSpan({ cls: 'vw-card-key', text: key });
    row.createSpan({ cls: 'vw-card-value', text: value });
  }
}

/** Карточка сводки с загрузкой по требованию. */
export class SpaceInfoView {
  readonly el: HTMLElement;

  constructor(private readonly deps: SpaceInfoDeps) {
    this.el = createDiv({ cls: 'vw-card vw-space-info' });
    this.el.createDiv({ cls: 'vw-empty', text: t('common.loading') });
  }

  async refresh(): Promise<void> {
    try {
      renderSpaceInfo(this.el, await fetchSpaceInfo(this.deps));
    } catch (error) {
      this.deps.log.warn('space', 'сводка не пришла', { reason: errorText(error) });
      this.el.empty();
      this.el.createDiv({ cls: 'vw-empty', text: t('spaceInfo.loadFailed') });
    }
  }
}

/**
 * Время последнего изменения лежит в metaCipher последней записи: сервер
 * времени изменения не хранит, у него только монотонный счётчик.
 */
async function lastChangedAt(deps: SpaceInfoDeps, seq: number): Promise<number | null> {
  const keys = deps.keys();
  if (seq <= 0 || keys === null) return null;
  const page = await deps.client.getChanges(deps.connection.spaceId, { since: seq - 1, limit: 1 });
  const item = page.items.at(-1);
  if (item === undefined || item.metaCipher === null) return null;
  try {
    return (await decryptMeta(keys.metaKey, item.metaCipher)).mtime;
  } catch {
    // Чужая эпоха или битый шифротекст: показываем «неизвестно», а не ломаем панель.
    return null;
  }
}
