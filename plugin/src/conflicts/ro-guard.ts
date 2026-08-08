import type { Role } from '@vaultwire/shared';
import { canWrite } from '@vaultwire/shared';
import type { ConflictDeps, ConflictInput, ConflictResolution, ConflictSide } from './resolve';
import { resolveConflict } from './resolve';

/**
 * Роль только для чтения из разделов 6 и 9. Отправить участник ничего не может,
 * поэтому единственный вопрос — что делать с его локальной правкой. Ответ один:
 * не терять. Локальная версия никогда не затирается молча, при расхождении она
 * ложится отдельным файлом рядом.
 */

/** Слияние и «побеждает свежий» роли ro недоступны: их результат некуда отправить. */
export const READ_ONLY_STRATEGY = 'copy';

export function isReadOnlyRole(role: Role): boolean {
  return !canWrite(role);
}

/**
 * Локальная версия совпадает с опорной точкой индекса: пользователь её не трогал,
 * приём серверной версии ничего не теряет.
 */
export function isLocalIntact(indexHash: string | undefined, localHash: string | null): boolean {
  if (localHash === null) return true;
  return indexHash !== undefined && indexHash === localHash;
}

export interface ReadOnlyPullInput {
  readonly path: string;
  readonly deviceLabel: string;
  readonly now: number;
  /** SHA-256 содержимого на диске; null — файла нет. */
  readonly localHash: string | null;
  /** Опорный хеш из индекса; undefined — файл ни разу не синхронизировался. */
  readonly indexHash: string | undefined;
  readonly local: ConflictSide | null;
  readonly remote: ConflictSide;
}

/**
 * Приём серверной версии для роли ro. Расхождение с индексом означает правку,
 * которая никуда не уедет, — она сохраняется копией до перезаписи основного пути.
 */
export async function planReadOnlyPull(
  input: ReadOnlyPullInput,
  deps: ConflictDeps,
): Promise<ConflictResolution> {
  const intact = isLocalIntact(input.indexHash, input.localHash);
  return resolveReadOnly(
    {
      path: input.path,
      deviceLabel: input.deviceLabel,
      now: input.now,
      local: intact ? null : input.local,
      remote: input.remote,
    },
    deps,
  );
}

/** Стратегия подключения игнорируется, отправки не будет ни при каком исходе. */
export async function resolveReadOnly(
  input: Omit<ConflictInput, 'strategy'>,
  deps: ConflictDeps,
): Promise<ConflictResolution> {
  const resolution = await resolveConflict({ ...input, strategy: READ_ONLY_STRATEGY }, deps);
  return { ...resolution, push: false };
}
