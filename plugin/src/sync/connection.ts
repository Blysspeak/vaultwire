import type { DocId, Role, SpaceId } from '@vaultwire/shared';
import { canWrite } from '@vaultwire/shared';
// Модули api берутся поимённо: сборный индекс тянет за собой requestUrl из obsidian.
import type { VaultwireClient } from '../api/client';
import { NetworkError, UnauthorizedError } from '../api/errors';
import { computeDocId } from '../crypto';
import type { KeyBundle } from '../crypto';
import { EchoGuard } from '../engine/echo';
import type { ConnectionIndex } from '../engine/state';
import type { RenameHint } from '../engine/types';
import type { ConnectionSettings } from '../settings/types';
import type { ConnectionState, RunReport } from './types';

/** Накопленные наблюдателем локальные изменения, забираются прогоном целиком. */
export interface PendingChanges {
  readonly paths: readonly string[];
  readonly renames: readonly RenameHint[];
}

/**
 * Одно подключение: одно пространство и одна локальная папка. Держит ключи в
 * памяти (на диск они не попадают никогда), состояние, курсор lastSeq и индекс.
 */
export class SyncConnection {
  /** Подавление эха общее на подключение: наблюдатель и применение смотрят в один набор. */
  readonly echo = new EchoGuard();

  private readonly docIds = new Map<string, DocId>();
  private readonly pendingPaths = new Set<string>();
  private readonly pendingRenames: RenameHint[] = [];
  private keyBundle: KeyBundle | null = null;
  private currentState: ConnectionState = 'idle';
  private currentReason: string | null = null;
  private report: RunReport | null = null;
  private massAllowed = false;

  constructor(
    readonly settings: ConnectionSettings,
    readonly client: VaultwireClient,
    readonly index: ConnectionIndex,
  ) {}

  get spaceId(): SpaceId {
    return this.settings.spaceId;
  }

  get folder(): string {
    return this.settings.localFolder;
  }

  get role(): Role {
    return this.settings.role;
  }

  get writable(): boolean {
    return canWrite(this.settings.role);
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get reason(): string | null {
    return this.currentReason;
  }

  get keys(): KeyBundle | null {
    return this.keyBundle;
  }

  get lastSeq(): number {
    return this.index.lastSeq;
  }

  get lastReport(): RunReport | null {
    return this.report;
  }

  /** Прогон имеет смысл только с ключами и вне паузы и отзыва. */
  get runnable(): boolean {
    if (this.keyBundle === null) return false;
    return this.currentState !== 'paused' && this.currentState !== 'revoked';
  }

  setKeys(keys: KeyBundle): void {
    this.keyBundle = keys;
    this.docIds.clear();
  }

  forgetKeys(): void {
    this.keyBundle = null;
    this.docIds.clear();
  }

  setState(state: ConnectionState, reason: string | null = null): void {
    this.currentState = state;
    this.currentReason = reason;
  }

  setRole(role: Role): void {
    this.settings.role = role;
  }

  /** Курсор догона: истина в индексе, в настройках копия для интерфейса. */
  setLastSeq(seq: number): void {
    this.index.setLastSeq(seq);
    this.settings.lastSeq = seq;
  }

  /**
   * Разбор ошибки прогона по таблице раздела 3: 401 — отозванный доступ,
   * обрыв транспорта — офлайн, всё прочее — ошибка с баннером.
   */
  fail(error: unknown): ConnectionState {
    const state: ConnectionState =
      error instanceof UnauthorizedError ? 'revoked' : error instanceof NetworkError ? 'offline' : 'error';
    this.setState(state, error instanceof Error ? error.message : String(error));
    return state;
  }

  markDirty(relPath: string): void {
    this.pendingPaths.add(relPath);
  }

  markRename(hint: RenameHint): void {
    this.pendingRenames.push(hint);
  }

  get pendingCount(): number {
    return this.pendingPaths.size + this.pendingRenames.length;
  }

  /** Забрать накопленное; повторный вызов уже ничего не отдаёт. */
  drain(): PendingChanges {
    const paths = [...this.pendingPaths];
    const renames = [...this.pendingRenames];
    this.pendingPaths.clear();
    this.pendingRenames.length = 0;
    return { paths, renames };
  }

  /** Подтверждение массового удаления действует ровно на один прогон. */
  allowMassOnce(): void {
    this.massAllowed = true;
  }

  takeMassAllowance(): boolean {
    const allowed = this.massAllowed;
    this.massAllowed = false;
    return allowed;
  }

  finishRun(report: RunReport): void {
    this.report = report;
    this.settings.lastSyncedAt = report.at;
  }

  /** docId детерминирован, поэтому считается один раз на путь за жизнь подключения. */
  async resolveDocIds(paths: readonly string[]): Promise<ReadonlyMap<string, DocId>> {
    const keys = this.keyBundle;
    if (keys === null) throw new Error('vaultwire: подключение без ключей');
    const missing = [...new Set(paths)].filter((path) => !this.docIds.has(path));
    const computed = await Promise.all(missing.map((path) => computeDocId(keys.pathKey, path)));
    missing.forEach((path, i) => {
      const docId = computed[i];
      if (docId !== undefined) this.docIds.set(path, docId);
    });
    return this.docIds;
  }
}
