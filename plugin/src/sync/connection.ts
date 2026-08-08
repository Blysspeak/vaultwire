import type { DocId, Role, SpaceId } from '@vaultwire/shared';
import { canWrite } from '@vaultwire/shared';
// Модули api берутся поимённо: сборный индекс тянет за собой requestUrl из obsidian.
import type { VaultwireClient } from '../api/client';
import type { KeyBundle } from '../crypto';
import { EchoGuard } from '../engine/echo';
import type { ConnectionIndex } from '../engine/state';
import type { RenameHint } from '../engine/types';
import type { ConnectionSettings } from '../settings/types';
import { DocIdCache } from './doc-ids';
import { reasonForError, stateForError } from './failure';
import { PendingBuffer } from './pending';
import type { PendingChanges } from './pending';
import type { ConnectionState, RunReport } from './types';

/**
 * Одно подключение: одно пространство и одна локальная папка. Держит выведенные
 * ключи в памяти, состояние, курсор lastSeq и индекс. Сами ключи на диск не
 * пишутся: при включённой опции сохраняется только пароль, и они выводятся заново.
 */
export class SyncConnection {
  /** Подавление эха общее на подключение: наблюдатель и применение смотрят в один набор. */
  readonly echo = new EchoGuard();

  private readonly docIds = new DocIdCache();
  private readonly pending = new PendingBuffer();
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

  fail(error: unknown): ConnectionState {
    const state = stateForError(error);
    this.setState(state, reasonForError(error));
    return state;
  }

  markDirty(relPath: string): void {
    this.pending.markDirty(relPath);
  }

  markRename(hint: RenameHint): void {
    this.pending.markRename(hint);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Забрать накопленное; повторный вызов уже ничего не отдаёт. */
  drain(): PendingChanges {
    return this.pending.drain();
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

  async resolveDocIds(paths: readonly string[]): Promise<ReadonlyMap<string, DocId>> {
    const keys = this.keyBundle;
    if (keys === null) throw new Error('vaultwire: подключение без ключей');
    return this.docIds.resolve(keys, paths);
  }
}
