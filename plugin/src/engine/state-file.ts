import type { SpaceId } from '@vaultwire/shared';
import type { IndexEntry } from './types';

/** Формат файла индекса; версия меняется при несовместимой правке структуры. */
export const STATE_VERSION = 1;

export interface StateFile {
  readonly version: number;
  readonly spaceId: SpaceId;
  /** Последний применённый seq сервера, точка догона changes. */
  readonly lastSeq: number;
  readonly entries: readonly IndexEntry[];
}

/** Достаточная часть vault.adapter: файл индекса лежит вне дерева заметок. */
export interface StateAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export function stateFolder(configDir: string): string {
  return `${configDir}/plugins/vaultwire`;
}

export function statePath(configDir: string, spaceId: SpaceId): string {
  return `${stateFolder(configDir)}/state-${spaceId}.json`;
}

export function serializeState(state: StateFile): string {
  return JSON.stringify(state);
}

/** Битый файл индекса не должен ронять подключение: получится полный пересбор. */
export function parseState(json: string, spaceId: SpaceId): StateFile {
  const empty: StateFile = { version: STATE_VERSION, spaceId, lastSeq: 0, entries: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return empty;
  }
  if (typeof raw !== 'object' || raw === null) return empty;
  const value = raw as Record<string, unknown>;
  if (value['version'] !== STATE_VERSION || value['spaceId'] !== spaceId) return empty;
  const lastSeq = typeof value['lastSeq'] === 'number' ? value['lastSeq'] : 0;
  const list = Array.isArray(value['entries']) ? value['entries'] : [];
  return { version: STATE_VERSION, spaceId, lastSeq, entries: list.filter(isIndexEntry) };
}

export async function readState(
  adapter: StateAdapter,
  configDir: string,
  spaceId: SpaceId,
): Promise<StateFile> {
  const path = statePath(configDir, spaceId);
  if (!(await adapter.exists(path))) {
    return { version: STATE_VERSION, spaceId, lastSeq: 0, entries: [] };
  }
  return parseState(await adapter.read(path), spaceId);
}

/**
 * Атомарная запись: сначала временный файл, потом rename. Прямая перезапись
 * оставила бы обрезанный индекс, если Obsidian закроют в момент сохранения.
 */
export async function writeStateAtomic(
  adapter: StateAdapter,
  configDir: string,
  state: StateFile,
): Promise<void> {
  const folder = stateFolder(configDir);
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
  const path = statePath(configDir, state.spaceId);
  const temp = `${path}.tmp`;
  await adapter.write(temp, serializeState(state));
  if (await adapter.exists(path)) await adapter.remove(path);
  await adapter.rename(temp, path);
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['path'] === 'string' &&
    typeof entry['docId'] === 'string' &&
    typeof entry['rev'] === 'number' &&
    typeof entry['plainHash'] === 'string' &&
    typeof entry['mtime'] === 'number' &&
    typeof entry['size'] === 'number' &&
    typeof entry['syncedAt'] === 'number' &&
    typeof entry['dirty'] === 'boolean'
  );
}
