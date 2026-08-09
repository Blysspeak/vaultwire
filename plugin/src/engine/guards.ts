import { normalizeRelPath } from '../crypto/docid';
import { isDestructive } from './ops';
import type { SyncOp } from './ops';

/** Пороги подтверждения массовых операций, приходят из настроек плагина. */
export interface MassThresholds {
  /** Абсолютный порог, штук; по умолчанию 20. */
  readonly absolute: number;
  /** Доля файлов подключения; по умолчанию 0.15. */
  readonly ratio: number;
}

export interface MassOperationCheck {
  readonly deletions: number;
  /** Доля от увиденных сканом файлов; 0, если сканировать было нечего. */
  readonly ratio: number;
  readonly confirmationRequired: boolean;
  /** Список для показа пользователю, в том же порядке, что и операции. */
  readonly paths: readonly string[];
}

/**
 * Ниже этого числа файлов доля не применяется: в папке из трёх заметок удаление
 * одной даёт 33 процента, и порог срабатывал бы на каждом обычном действии.
 * Смысл доли — поймать «снесло половину большого хранилища», а не рутину.
 */
export const RATIO_MIN_FILES = 20;

/**
 * Порог массовых операций раздела 6: больше 20 файлов к удалению либо заметная
 * доля достаточно большой папки — прогон останавливается и требует подтверждения.
 * Ловит отвалившийся сетевой диск и случайно удалённую папку.
 */
export function checkMassOperations(
  ops: readonly SyncOp[],
  scannedFiles: number,
  thresholds: MassThresholds,
): MassOperationCheck {
  const paths = ops.filter(isDestructive).map((op) => op.path);
  const deletions = paths.length;
  const ratio = scannedFiles > 0 ? deletions / scannedFiles : 0;
  const ratioApplies = scannedFiles >= RATIO_MIN_FILES && ratio > thresholds.ratio;
  const confirmationRequired =
    deletions > 0 && (deletions > thresholds.absolute || ratioApplies);
  return { deletions, ratio, confirmationRequired, paths };
}

/** Пара папок подключений, одна внутри другой. Вложенность запрещена. */
export interface NestedConnections {
  readonly outer: string;
  readonly inner: string;
}

/**
 * Вложенные подключения дали бы один файл в двух пространствах: два индекса,
 * два набора решений и бесконечная перезапись. Пустая строка — корень хранилища.
 */
export function findNestedConnections(folders: readonly string[]): NestedConnections[] {
  const normalized = folders.map(normalizeRelPath);
  const found: NestedConnections[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = 0; j < normalized.length; j += 1) {
      if (i === j) continue;
      const outer = normalized[i] ?? '';
      const inner = normalized[j] ?? '';
      if (contains(outer, inner) && !(outer === inner && j < i)) {
        found.push({ outer, inner });
      }
    }
  }
  return found;
}

export function isFolderConflict(folders: readonly string[], candidate: string): boolean {
  const target = normalizeRelPath(candidate);
  return folders.map(normalizeRelPath).some((folder) => contains(folder, target) || contains(target, folder));
}

/** Группы путей, различающихся только регистром. */
export function findCaseCollisions(paths: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const key = normalizeRelPath(path).toLowerCase();
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [path]);
    else if (!group.includes(path)) group.push(path);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function contains(outer: string, inner: string): boolean {
  if (outer === inner) return true;
  return outer === '' || inner.startsWith(`${outer}/`);
}
