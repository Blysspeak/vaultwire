import type { SpaceId } from '@vaultwire/shared';
import { normalizeRelPath } from '../../crypto';
import { isFolderConflict } from '../../engine/guards';

/** Причины, по которым папка не годится под подключение. */
export const FOLDER_ISSUES = ['invalid', 'reserved', 'duplicate', 'nested'] as const;
export type FolderIssue = (typeof FOLDER_ISSUES)[number];

/** Достаточная часть подключения: правилам выбора папки остальное не нужно. */
export interface ExistingConnection {
  readonly spaceId: SpaceId;
  readonly localFolder: string;
}

export interface FolderChoice {
  /** Пустая строка — корень хранилища. */
  readonly folder: string;
  readonly spaceId: SpaceId;
  readonly existing: readonly ExistingConnection[];
}

/** Служебные папки Obsidian синхронизации не подлежат (раздел 12 и ALWAYS_EXCLUDED). */
const RESERVED_ROOTS = ['.obsidian', '.trash'] as const;

/**
 * Проверки шага выбора папки. Пространство дважды в одном хранилище дало бы два
 * индекса на один набор файлов, вложенные папки — один файл в двух пространствах.
 */
export function validateFolderChoice(choice: FolderChoice): FolderIssue | null {
  const folder = normalizeRelPath(choice.folder);
  if (!isSaneFolder(folder)) return 'invalid';
  if (isReserved(folder)) return 'reserved';
  if (choice.existing.some((connection) => connection.spaceId === choice.spaceId)) return 'duplicate';
  const folders = choice.existing.map((connection) => connection.localFolder);
  if (isFolderConflict(folders, folder)) return 'nested';
  return null;
}

/** Путь внутри хранилища: без дисков, без «..», без пустых сегментов. */
export function isSaneFolder(folder: string): boolean {
  const normalized = normalizeRelPath(folder);
  if (normalized === '') return true;
  if (/^[A-Za-z]:/u.test(normalized)) return false;
  return normalized.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isReserved(folder: string): boolean {
  return RESERVED_ROOTS.some((root) => folder === root || folder.startsWith(`${root}/`));
}
