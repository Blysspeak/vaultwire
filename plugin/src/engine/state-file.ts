import type { DocId, SpaceId } from '@vaultwire/shared';
import { SYNC_DIRECTIONS } from './types';
import type { IndexEntry, SyncDirection } from './types';

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
  const entries = list.map(readEntry).filter((entry): entry is IndexEntry => entry !== null);
  return { version: STATE_VERSION, spaceId, lastSeq, entries };
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

/**
 * Запись индекса из файла. Автор и направление появились позже обязательных
 * полей, поэтому их отсутствие не повод выкидывать запись: подставляется null.
 */
function readEntry(value: unknown): IndexEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { path, docId, rev, plainHash, mtime, size, syncedAt, dirty } = raw;
  if (
    typeof path !== 'string' ||
    typeof docId !== 'string' ||
    typeof rev !== 'number' ||
    typeof plainHash !== 'string' ||
    typeof mtime !== 'number' ||
    typeof size !== 'number' ||
    typeof syncedAt !== 'number' ||
    typeof dirty !== 'boolean'
  ) {
    return null;
  }
  const author = raw['lastAuthor'];
  const direction = raw['lastDirection'];
  return {
    path,
    docId: docId as DocId,
    rev,
    plainHash,
    mtime,
    size,
    syncedAt,
    dirty,
    lastAuthor: typeof author === 'string' ? author : null,
    lastDirection: isDirection(direction) ? direction : null,
  };
}

function isDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && (SYNC_DIRECTIONS as readonly string[]).includes(value);
}
