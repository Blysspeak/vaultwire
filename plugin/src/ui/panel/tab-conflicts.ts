import type { SpaceId } from '@vaultwire/shared';
import { Notice, type App } from 'obsidian';
import type { ConflictRecord } from '../../conflicts/registry-file';
import { t } from '../../i18n/ru';
import type { ConnectionStatus } from '../../sync/status';
import { openSideBySide } from './open-both';
import { actionButton, formatMoment, joinMeta, list, listItem, note } from './render';
import type { PanelHost, PanelTabView } from './types';

/** Вкладка незакрытых конфликтов: чья версия останется, решает пользователь. */
export function createConflictsTab(host: PanelHost, app: App): PanelTabView {
  const el = createDiv({ cls: 'vw-tab' });
  const body = list(el);
  const empty = note(el, t('conflicts.empty'));
  let connections: readonly ConnectionStatus[] = [];
  let signature = '';

  function sign(): string {
    return connections
      .map((item) => `${item.spaceId}:${keysOf(host.conflicts(item.spaceId))}`)
      .join('|');
  }

  function render(): void {
    body.empty();
    let count = 0;
    for (const connection of connections) {
      for (const record of host.conflicts(connection.spaceId)) {
        count += 1;
        renderConflict(body, connection.spaceId, record, { host, app, refresh });
      }
    }
    empty.toggle(count === 0);
  }

  /** После решения список перестраивается сразу: реестр уже изменился. */
  function refresh(): void {
    signature = sign();
    render();
  }

  return {
    el,
    update: (status): void => {
      connections = status.connections;
      const next = sign();
      if (next === signature) return;
      signature = next;
      render();
    },
  };
}

interface ConflictDeps {
  readonly host: PanelHost;
  readonly app: App;
  readonly refresh: () => void;
}

function renderConflict(
  parent: HTMLElement,
  spaceId: SpaceId,
  record: ConflictRecord,
  deps: ConflictDeps,
): void {
  const parts = listItem(parent, record.path);
  parts.meta.setText(
    joinMeta([
      t(`conflict.outcome.${record.outcome}`),
      record.refusal === null
        ? null
        : t('conflicts.refusal', { reason: t(`merge.refusal.${record.refusal}`) }),
      formatMoment(record.at),
      record.copyPath === null ? t('conflicts.noCopy') : null,
    ]),
  );

  const copyPath = record.copyPath;
  if (copyPath !== null) {
    actionButton(parts.actions, t('conflicts.keepMine'), async () => {
      await deps.host.keepMine(spaceId, record.docId);
      deps.refresh();
    });
  }
  actionButton(parts.actions, t('conflicts.keepServer'), async () => {
    await deps.host.keepServer(spaceId, record.docId);
    deps.refresh();
  });
  if (copyPath !== null) {
    actionButton(parts.actions, t('conflicts.openBoth'), async () => {
      const opened = await openSideBySide(deps.app, record.path, copyPath);
      if (!opened) new Notice(t('conflicts.openFailed'));
    });
  }
}

function keysOf(records: readonly ConflictRecord[]): string {
  return records.map((record) => `${record.docId}@${record.at}`).join(',');
}
