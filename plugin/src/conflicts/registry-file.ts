import type { DocId, SpaceId } from '@vaultwire/shared';
import type { StateAdapter } from '../engine/state-file';
import { stateFolder } from '../engine/state-file';
import type { MergeRefusal } from './merge';
import type { ConflictOutcome } from './resolve';

/** Формат файла реестра конфликтов; версия меняется при несовместимой правке. */
export const CONFLICTS_VERSION = 1;

/** Незакрытый конфликт: пользователь ещё не выбрал, чья версия останется. */
export interface ConflictRecord {
  readonly docId: DocId;
  /** Основной путь, куда легла серверная версия. */
  readonly path: string;
  /** Конфликтная копия с локальной версией; null — копии не было. */
  readonly copyPath: string | null;
  readonly at: number;
  readonly outcome: ConflictOutcome;
  /** Почему не сложилось автослияние; null — его не пробовали. */
  readonly refusal: MergeRefusal | null;
}

export interface ConflictsFile {
  readonly version: number;
  readonly spaceId: SpaceId;
  readonly records: readonly ConflictRecord[];
}

export function conflictsPath(configDir: string, spaceId: SpaceId): string {
  return `${stateFolder(configDir)}/conflicts-${spaceId}.json`;
}

/** Битый файл реестра не должен ронять подключение: конфликты просто соберутся заново. */
export function parseConflicts(json: string, spaceId: SpaceId): ConflictRecord[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null) return [];
  const value = raw as Record<string, unknown>;
  if (value['version'] !== CONFLICTS_VERSION || value['spaceId'] !== spaceId) return [];
  const list = Array.isArray(value['records']) ? value['records'] : [];
  return list.filter(isRecord);
}

export async function readConflicts(
  adapter: StateAdapter,
  configDir: string,
  spaceId: SpaceId,
): Promise<ConflictRecord[]> {
  const path = conflictsPath(configDir, spaceId);
  if (!(await adapter.exists(path))) return [];
  return parseConflicts(await adapter.read(path), spaceId);
}

/** Запись через временный файл и rename: обрыв не оставит обрезанный реестр. */
export async function writeConflicts(
  adapter: StateAdapter,
  configDir: string,
  file: ConflictsFile,
): Promise<void> {
  const folder = stateFolder(configDir);
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
  const path = conflictsPath(configDir, file.spaceId);
  const temp = `${path}.tmp`;
  await adapter.write(temp, JSON.stringify(file));
  if (await adapter.exists(path)) await adapter.remove(path);
  await adapter.rename(temp, path);
}

function isRecord(value: unknown): value is ConflictRecord {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['docId'] === 'string' &&
    typeof entry['path'] === 'string' &&
    (entry['copyPath'] === null || typeof entry['copyPath'] === 'string') &&
    typeof entry['at'] === 'number' &&
    typeof entry['outcome'] === 'string'
  );
}
