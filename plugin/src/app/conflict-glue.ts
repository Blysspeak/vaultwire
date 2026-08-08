import type { App } from 'obsidian';
import { frontmatterEndFromCache } from '../conflicts/frontmatter';
import { loadBaseText, mergeMarkdown } from '../conflicts/merge';
import type { MergeOutcome } from '../conflicts/merge';
import type { ConflictRecord } from '../conflicts/registry-file';
import type { MergeRequest } from '../conflicts/resolve';
import type { RingLog } from '../log';
import { relativePath } from '../sync/paths';
import type { ConnectionRuntime, SyncManager } from '../sync';
import { historyDeps } from './history-deps';
import type { ConflictRegistries } from './registries';

/** Автослияние и запись конфликта в реестр: то, чего движку не хватает без плагина. */
export interface ConflictGlue {
  merge(request: MergeRequest): Promise<MergeOutcome>;
  onConflict(record: ConflictRecord): Promise<void>;
}

export interface GlueDeps {
  readonly app: App;
  /** Реестр создаётся позже самой обвязки, поэтому берётся функцией. */
  readonly manager: () => SyncManager | null;
  readonly registries: ConflictRegistries;
  readonly log: RingLog;
}

export function createConflictGlue(deps: GlueDeps): ConflictGlue {
  return {
    merge: (request: MergeRequest): Promise<MergeOutcome> => runMerge(deps, request),
    onConflict: async (record: ConflictRecord): Promise<void> => {
      const runtime = findByPath(deps.manager(), record.path);
      if (runtime === null) return;
      await deps.registries.ensure(runtime.connection.spaceId).add(record);
    },
  };
}

async function runMerge(deps: GlueDeps, request: MergeRequest): Promise<MergeOutcome> {
  return mergeMarkdown({
    path: request.path,
    base: await loadBase(deps, request.path),
    local: request.local,
    remote: request.remote,
    localFrontmatterEnd: frontmatterEndFromCache(deps.app, request.path),
  });
}

/**
 * Базовый текст берётся с сервера по rev из индекса. Сеть могла отвалиться —
 * тогда базы нет, и слияние честно уходит в конфликтную копию с отказом no-base.
 */
async function loadBase(deps: GlueDeps, path: string): Promise<string | null> {
  const runtime = findByPath(deps.manager(), path);
  if (runtime === null) return null;
  const relPath = relativePath(runtime.connection.folder, path);
  const entry = relPath === null ? undefined : runtime.connection.index.get(relPath);
  const history = historyDeps(runtime);
  if (entry === undefined || history === null) return null;
  try {
    return await loadBaseText(history, entry.docId, entry.rev);
  } catch (error) {
    deps.log.warn('conflicts', 'базовая версия не пришла', {
      path,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Обвязка общая на все подключения, а путь принадлежит одному: папки не пересекаются. */
function findByPath(manager: SyncManager | null, path: string): ConnectionRuntime | null {
  if (manager === null) return null;
  const found = manager
    .all()
    .find((runtime) => relativePath(runtime.connection.folder, path) !== null);
  return found ?? null;
}
