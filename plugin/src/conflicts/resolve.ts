import type { WriteRequest } from '../engine/apply';
import type { ConflictStrategy } from '../settings/types';
import type { MergeOutcome, MergeRefusal } from './merge';
import { conflictCopyPath } from './naming';

/**
 * Применение стратегии конфликта из раздела 7. Серверная версия всегда ложится
 * в основной путь, локальная уходит в копию: так пользователь видит у себя то же,
 * что и остальные, и при этом ничего не теряет.
 */

/** Содержимое одной из версий вместе с временами для записи. */
export interface ConflictSide {
  /** Текст для markdown, буфер для всего остального. */
  readonly data: string | ArrayBuffer;
  readonly mtime: number;
  readonly ctime: number;
}

export interface ConflictInput {
  /** Путь от корня хранилища: по нему пишется файл. */
  readonly path: string;
  readonly strategy: ConflictStrategy;
  /** Метка своего устройства, попадает в имя копии. */
  readonly deviceLabel: string;
  /** Локальная версия; null — локального файла нет, конфликта тоже. */
  readonly local: ConflictSide | null;
  readonly remote: ConflictSide;
  /** Момент разрешения, попадает в имя копии. */
  readonly now: number;
}

export interface MergeRequest {
  readonly path: string;
  readonly local: string | ArrayBuffer;
  readonly remote: string | ArrayBuffer;
}

export interface ConflictDeps {
  /** Файл уже есть в хранилище: нужно для дедупликации имени копии. */
  readonly exists: (path: string) => boolean;
  /** Автослияние; не задано — стратегия merge сразу уходит в копию. */
  readonly merge?: (request: MergeRequest) => Promise<MergeOutcome>;
}

/** copy — копия рядом, server — победила серверная, local — локальная, merged — слияние. */
export const CONFLICT_OUTCOMES = ['copy', 'server', 'local', 'merged'] as const;
export type ConflictOutcome = (typeof CONFLICT_OUTCOMES)[number];

export interface ConflictResolution {
  readonly outcome: ConflictOutcome;
  /** Порядок записей обязателен: копия появляется раньше, чем затирается основной путь. */
  readonly writes: readonly WriteRequest[];
  readonly copyPath: string | null;
  /** В основном пути не серверная версия: результат нужно отправить. */
  readonly push: boolean;
  /** Почему автослияние не сложилось; null — его и не пробовали. */
  readonly refusal: MergeRefusal | null;
}

export async function resolveConflict(
  input: ConflictInput,
  deps: ConflictDeps,
): Promise<ConflictResolution> {
  const local = input.local;
  if (local === null) return takeServer(input);
  if (input.strategy === 'newest') return takeNewest(input, local);
  if (input.strategy === 'merge') return tryMerge(input, local, deps);
  return makeCopy(input, local, deps, null);
}

/** Локального файла нет: принимаем серверную версию без копий. */
function takeServer(input: ConflictInput): ConflictResolution {
  return {
    outcome: 'server',
    writes: [write(input.path, input.remote)],
    copyPath: null,
    push: false,
    refusal: null,
  };
}

/** «Побеждает свежий» для служебных папок: проигравшая версия не сохраняется. */
function takeNewest(input: ConflictInput, local: ConflictSide): ConflictResolution {
  if (local.mtime <= input.remote.mtime) return takeServer(input);
  // Локальная свежее: файл на диске уже нужный, остаётся отправить его на сервер.
  return { outcome: 'local', writes: [], copyPath: null, push: true, refusal: null };
}

async function tryMerge(
  input: ConflictInput,
  local: ConflictSide,
  deps: ConflictDeps,
): Promise<ConflictResolution> {
  if (deps.merge === undefined) return makeCopy(input, local, deps, 'no-base');
  const result = await deps.merge({
    path: input.path,
    local: local.data,
    remote: input.remote.data,
  });
  if (!result.ok) return makeCopy(input, local, deps, result.refusal);
  const merged: ConflictSide = {
    data: result.text,
    mtime: input.now,
    ctime: local.ctime,
  };
  return {
    outcome: 'merged',
    writes: [write(input.path, merged)],
    copyPath: null,
    push: true,
    refusal: null,
  };
}

/** Поведение по умолчанию: сервер в основной путь, локальная версия рядом копией. */
function makeCopy(
  input: ConflictInput,
  local: ConflictSide,
  deps: ConflictDeps,
  refusal: MergeRefusal | null,
): ConflictResolution {
  const copyPath = conflictCopyPath(input.path, input.deviceLabel, input.now, deps.exists);
  return {
    outcome: 'copy',
    writes: [write(copyPath, local), write(input.path, input.remote)],
    copyPath,
    push: false,
    refusal,
  };
}

function write(path: string, side: ConflictSide): WriteRequest {
  return { path, data: side.data, mtime: side.mtime, ctime: side.ctime };
}
