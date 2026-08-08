import type { DocId, SpaceId } from '@vaultwire/shared';
import type { StateAdapter } from '../engine/state-file';
import { isConflictCopy } from './naming';
import type { ConflictRecord } from './registry-file';
import { CONFLICTS_VERSION, conflictsPath, readConflicts, writeConflicts } from './registry-file';

/**
 * Реестр незакрытых конфликтов подключения. Переживает перезапуск: конфликт,
 * забытый при закрытии Obsidian, иначе исчезает из панели, а копия остаётся
 * лежать в хранилище без объяснения, откуда она взялась.
 */
export class ConflictRegistry {
  private readonly records = new Map<DocId, ConflictRecord>();

  constructor(
    private readonly adapter: StateAdapter,
    private readonly configDir: string,
    private readonly spaceId: SpaceId,
  ) {}

  get path(): string {
    return conflictsPath(this.configDir, this.spaceId);
  }

  async load(): Promise<void> {
    this.records.clear();
    for (const record of await readConflicts(this.adapter, this.configDir, this.spaceId)) {
      this.records.set(record.docId, record);
    }
  }

  all(): ConflictRecord[] {
    return [...this.records.values()].sort((a, b) => b.at - a.at);
  }

  get(docId: DocId): ConflictRecord | undefined {
    return this.records.get(docId);
  }

  /** Повторный конфликт по документу заменяет прежнюю запись: копий может быть много, вопрос один. */
  async add(record: ConflictRecord): Promise<void> {
    this.records.set(record.docId, record);
    await this.save();
  }

  async forget(docId: DocId): Promise<void> {
    if (!this.records.delete(docId)) return;
    await this.save();
  }

  /**
   * «Оставить мою»: копия занимает основной путь. Серверная версия уходит в
   * корзину, а не удаляется: откат решения не должен стоить данных.
   */
  async keepMine(files: ConflictFiles, docId: DocId): Promise<boolean> {
    const record = this.records.get(docId);
    if (record === undefined || record.copyPath === null) return false;
    if (files.exists(record.path)) await files.trash(record.path);
    await files.rename(record.copyPath, record.path);
    await this.forget(docId);
    return true;
  }

  /** «Оставить серверную»: в основном пути она уже лежит, остаётся убрать копию. */
  async keepServer(files: ConflictFiles, docId: DocId): Promise<boolean> {
    const record = this.records.get(docId);
    if (record === undefined) return false;
    if (record.copyPath !== null && files.exists(record.copyPath)) {
      await files.trash(record.copyPath);
    }
    await this.forget(docId);
    return true;
  }

  /**
   * Команда «убрать все конфликтные копии подключения». Список путей приходит
   * снаружи: чужие копии прилетают синхронизацией и в реестре не значатся.
   */
  async clearCopies(files: ConflictFiles, paths: readonly string[]): Promise<string[]> {
    const targets = new Set(paths.filter(isConflictCopy));
    for (const record of this.records.values()) {
      if (record.copyPath !== null) targets.add(record.copyPath);
    }
    const removed: string[] = [];
    for (const path of targets) {
      if (!files.exists(path)) continue;
      await files.trash(path);
      removed.push(path);
    }
    this.records.clear();
    await this.save();
    return removed;
  }

  private async save(): Promise<void> {
    await writeConflicts(this.adapter, this.configDir, {
      version: CONFLICTS_VERSION,
      spaceId: this.spaceId,
      records: this.all(),
    });
  }
}

/** Файловые операции над копиями. Удаление всегда в корзину, никогда мимо неё. */
export interface ConflictFiles {
  exists(path: string): boolean;
  rename(from: string, to: string): Promise<void>;
  trash(path: string): Promise<void>;
}
