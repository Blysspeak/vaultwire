import type { VaultGateway } from '../engine/apply';
import type { RingLog } from '../log';
import type { SyncConnection } from './connection';
import { runPass } from './pass';
import type { PassDeps } from './pass';
import { emptyReport } from './types';
import type { RunReport, SyncLimits, VaultReader } from './types';

export interface RunnerDeps {
  readonly connection: SyncConnection;
  readonly reader: VaultReader;
  readonly gateway: VaultGateway;
  /** Функцией: пределы правятся в настройках между прогонами. */
  readonly limits: () => SyncLimits;
  readonly log: RingLog;
  readonly now?: () => number;
  /** Автослияние markdown; не задано — стратегия merge уходит в конфликтную копию. */
  readonly merge?: PassDeps['merge'];
  readonly onConflict?: PassDeps['onConflict'];
}

/**
 * Склейка прогонов: пока один идёт, все новые запросы сливаются в один
 * следующий. Без склейки шквал событий хранилища породил бы столько же
 * параллельных прогонов, и они передрались бы за индекс и за курсор.
 */
export class SyncRunner {
  private current: Promise<RunReport> | null = null;
  private queued: Promise<RunReport> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: RunnerDeps) {
    this.now = deps.now ?? Date.now;
  }

  get busy(): boolean {
    return this.current !== null;
  }

  /** Ожидание уже стоит в очереди — вернётся его же обещание, второй раз не запустится. */
  run(): Promise<RunReport> {
    if (this.current === null) return this.begin();
    this.queued ??= this.current.then(
      () => this.startQueued(),
      () => this.startQueued(),
    );
    return this.queued;
  }

  private startQueued(): Promise<RunReport> {
    this.queued = null;
    return this.begin();
  }

  private begin(): Promise<RunReport> {
    const promise = this.guarded().finally(() => {
      if (this.current === promise) this.current = null;
    });
    this.current = promise;
    return promise;
  }

  /** Прогон не бросает: его дёргают таймер и события хранилища, ловить некому. */
  private async guarded(): Promise<RunReport> {
    const { connection, log } = this.deps;
    const at = this.now();
    if (!connection.runnable) return emptyReport(connection.spaceId, at, connection.lastSeq, true);
    connection.setState('syncing');
    try {
      const report = await runPass(this.pass(), at);
      connection.setState(connection.writable ? 'idle' : 'readonly');
      connection.finishRun(report);
      return report;
    } catch (error) {
      const state = connection.fail(error);
      log.error('sync', 'прогон прерван', {
        space: connection.spaceId,
        state,
        reason: connection.reason,
      });
      return emptyReport(connection.spaceId, at, connection.lastSeq, true);
    }
  }

  private pass(): PassDeps {
    return {
      connection: this.deps.connection,
      reader: this.deps.reader,
      gateway: this.deps.gateway,
      limits: this.deps.limits,
      log: this.deps.log,
      now: this.now,
      ...(this.deps.merge === undefined ? {} : { merge: this.deps.merge }),
      ...(this.deps.onConflict === undefined ? {} : { onConflict: this.deps.onConflict }),
    };
  }
}
