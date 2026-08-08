import { t } from '../../i18n/ru';
import type { ConnectionStatus, SyncStatus } from '../../sync/status';
import { actionButton, joinMeta, list, listItem, note, section } from './render';
import type { PanelHost } from './types';

/** Последние операции и проблемные документы. Списки пересобираются только после прогона. */

const RECENT_LIMIT = 20;

type OpKind = 'pulled' | 'pushed' | 'trashed' | 'conflict';

interface RecentOp {
  readonly path: string;
  readonly kind: OpKind;
  readonly space: string;
  readonly at: number;
}

export interface ActivityLists {
  update(status: SyncStatus): void;
}

export function renderActivityLists(parent: HTMLElement, host: PanelHost): ActivityLists {
  const recentBody = section(parent, t('activity.recent'));
  const recentList = list(recentBody);
  const recentEmpty = note(recentBody, t('activity.recentEmpty'));

  const problemsBody = section(parent, t('activity.problems'));
  const problemsList = list(problemsBody);
  const problemsEmpty = note(problemsBody, t('activity.problemsEmpty'));

  let signature = '';

  const update = (status: SyncStatus): void => {
    const next = signatureOf(status.connections);
    if (next === signature) return;
    signature = next;
    fillRecent(recentList, recentEmpty, collectRecent(host, status.connections));
    fillProblems(problemsList, problemsEmpty, host, status.connections);
  };

  return { update };
}

/** Прогон двигает lastSyncedAt, поэтому подпись ловит и новый отчёт, и новые проблемы. */
function signatureOf(connections: readonly ConnectionStatus[]): string {
  return connections
    .map((item) => `${item.spaceId}:${item.lastSyncedAt ?? 0}:${item.problems}`)
    .join('|');
}

function collectRecent(host: PanelHost, connections: readonly ConnectionStatus[]): RecentOp[] {
  const items: RecentOp[] = [];
  const many = connections.length > 1;
  for (const connection of connections) {
    const report = host.report(connection.spaceId);
    if (report === null) continue;
    const space = many ? connection.label : '';
    const add = (paths: readonly string[], kind: OpKind): void => {
      for (const path of paths) items.push({ path, kind, space, at: report.at });
    };
    add(report.pulled, 'pulled');
    add(report.pushed, 'pushed');
    add(report.trashed, 'trashed');
    add(report.conflicts, 'conflict');
  }
  return items.sort((a, b) => b.at - a.at).slice(0, RECENT_LIMIT);
}

function fillRecent(target: HTMLElement, empty: HTMLElement, items: readonly RecentOp[]): void {
  target.empty();
  empty.toggle(items.length === 0);
  for (const item of items) {
    const parts = listItem(target, item.path);
    parts.meta.setText(joinMeta([t(`op.${item.kind}`), item.space]));
    parts.actions.remove();
  }
}

function fillProblems(
  target: HTMLElement,
  empty: HTMLElement,
  host: PanelHost,
  connections: readonly ConnectionStatus[],
): void {
  target.empty();
  let count = 0;
  for (const connection of connections) {
    const report = host.report(connection.spaceId);
    if (report === null) continue;
    for (const problem of report.problems) {
      count += 1;
      const parts = listItem(target, problem.path);
      parts.meta.setText(
        joinMeta([problem.message, t('activity.attempts', { count: problem.attempts })]),
      );
      actionButton(parts.actions, t('activity.retry'), () =>
        host.retry(connection.spaceId, problem.id),
      );
    }
  }
  empty.toggle(count === 0);
}
