import type { RenameHint } from '../engine/types';

/** Накопленные наблюдателем локальные изменения, забираются прогоном целиком. */
export interface PendingChanges {
  readonly paths: readonly string[];
  readonly renames: readonly RenameHint[];
}

/**
 * Копилка между событиями хранилища и прогоном. Наблюдатель дописывает сюда
 * дебаунсом, прогон забирает всё разом: так одно событие не порождает прогон.
 */
export class PendingBuffer {
  private readonly paths = new Set<string>();
  private readonly renames: RenameHint[] = [];

  get size(): number {
    return this.paths.size + this.renames.length;
  }

  markDirty(relPath: string): void {
    this.paths.add(relPath);
  }

  markRename(hint: RenameHint): void {
    this.renames.push(hint);
  }

  /** Забрать накопленное; повторный вызов уже ничего не отдаёт. */
  drain(): PendingChanges {
    const paths = [...this.paths];
    const renames = [...this.renames];
    this.paths.clear();
    this.renames.length = 0;
    return { paths, renames };
  }
}
