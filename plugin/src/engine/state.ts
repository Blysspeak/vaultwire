import type { DocId, SpaceId } from '@vaultwire/shared';
import type { StateAdapter, StateFile } from './state-file';
import { STATE_VERSION, readState, statePath, writeStateAtomic } from './state-file';
import type { IndexEntry } from './types';

/** Дебаунс сохранения: правки идут пачками, писать файл на каждую бессмысленно. */
export const STATE_DEBOUNCE_MS = 1_000;

export interface ConnectionIndexOptions {
  readonly configDir: string;
  readonly spaceId: SpaceId;
  readonly debounceMs?: number;
  /** Таймер вынесен наружу ради тестов; по умолчанию обычный setTimeout. */
  readonly schedule?: (run: () => void, ms: number) => number;
  readonly cancel?: (handle: number) => void;
}

/**
 * Локальный индекс подключения из раздела 6. Живёт в памяти, на диск уходит
 * атомарно и с дебаунсом; файл лежит в <configDir>/plugins/vaultwire.
 */
export class ConnectionIndex {
  private readonly entries = new Map<string, IndexEntry>();
  private readonly byDoc = new Map<DocId, IndexEntry>();
  private readonly debounceMs: number;
  private readonly schedule: (run: () => void, ms: number) => number;
  private readonly cancel: (handle: number) => void;
  private timer: number | null = null;
  private saving: Promise<void> = Promise.resolve();
  private pending = false;
  private seq = 0;

  constructor(
    private readonly adapter: StateAdapter,
    private readonly options: ConnectionIndexOptions,
  ) {
    this.debounceMs = options.debounceMs ?? STATE_DEBOUNCE_MS;
    this.schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms) as unknown as number);
    this.cancel = options.cancel ?? ((handle) => { clearTimeout(handle); });
  }

  get path(): string {
    return statePath(this.options.configDir, this.options.spaceId);
  }

  get lastSeq(): number {
    return this.seq;
  }

  async load(): Promise<void> {
    const state = await readState(this.adapter, this.options.configDir, this.options.spaceId);
    this.entries.clear();
    this.byDoc.clear();
    for (const entry of state.entries) this.put(entry);
    this.seq = state.lastSeq;
    this.pending = false;
  }

  all(): IndexEntry[] {
    return [...this.entries.values()];
  }

  get(path: string): IndexEntry | undefined {
    return this.entries.get(path);
  }

  getByDocId(docId: DocId): IndexEntry | undefined {
    return this.byDoc.get(docId);
  }

  set(entry: IndexEntry): void {
    this.put(entry);
    this.touch();
  }

  delete(path: string): void {
    const entry = this.entries.get(path);
    if (entry === undefined) return;
    this.entries.delete(path);
    this.byDoc.delete(entry.docId);
    this.touch();
  }

  setLastSeq(seq: number): void {
    if (seq === this.seq) return;
    this.seq = seq;
    this.touch();
  }

  /** Офлайн-правка: помечаем запись и ждём сети. */
  markDirty(path: string, dirty: boolean): void {
    const entry = this.entries.get(path);
    if (entry === undefined || entry.dirty === dirty) return;
    this.set({ ...entry, dirty });
  }

  snapshot(): StateFile {
    return {
      version: STATE_VERSION,
      spaceId: this.options.spaceId,
      lastSeq: this.seq,
      entries: this.all(),
    };
  }

  /** Записать немедленно: вызывается при выгрузке плагина и перед выходом из прогона. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (!this.pending) {
      await this.saving;
      return;
    }
    this.pending = false;
    const state = this.snapshot();
    this.saving = this.saving.then(() =>
      writeStateAtomic(this.adapter, this.options.configDir, state),
    );
    await this.saving;
  }

  dispose(): void {
    this.clearTimer();
  }

  private put(entry: IndexEntry): void {
    const previous = this.entries.get(entry.path);
    if (previous !== undefined && previous.docId !== entry.docId) this.byDoc.delete(previous.docId);
    this.entries.set(entry.path, entry);
    this.byDoc.set(entry.docId, entry);
  }

  private touch(): void {
    this.pending = true;
    if (this.timer !== null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.cancel(this.timer);
    this.timer = null;
  }
}
