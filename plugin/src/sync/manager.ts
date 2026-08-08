import type { SpaceId } from '@vaultwire/shared';
import type { LocalFile } from '../engine/types';
import type { ConnectionSettings } from '../settings/types';
import { bootstrapConnection } from './bootstrap';
import type { BootstrapResult } from './bootstrap';
import type { SyncConnection } from './connection';
import { createRuntime } from './runtime';
import type { ConnectionRuntime, RuntimeDeps } from './runtime';
import { aggregateStatus } from './status';
import type { SyncStatus } from './status';
import type { RunReport } from './types';

/** Реестр подключений плагина: создание, старт, пауза, остановка, доступ по spaceId. */
export class SyncManager {
  private readonly runtimes = new Map<SpaceId, ConnectionRuntime>();

  constructor(private readonly deps: RuntimeDeps) {}

  add(settings: ConnectionSettings): ConnectionRuntime {
    const existing = this.runtimes.get(settings.spaceId);
    if (existing !== undefined) return existing;
    const runtime = createRuntime(settings, this.deps);
    this.runtimes.set(settings.spaceId, runtime);
    return runtime;
  }

  get(spaceId: SpaceId): ConnectionRuntime | undefined {
    return this.runtimes.get(spaceId);
  }

  connection(spaceId: SpaceId): SyncConnection | undefined {
    return this.runtimes.get(spaceId)?.connection;
  }

  all(): ConnectionRuntime[] {
    return [...this.runtimes.values()];
  }

  status(): SyncStatus {
    return aggregateStatus(this.all().map((runtime) => runtime.connection));
  }

  /** Пароль живёт только здесь и в выведенных ключах: на диск он не попадает. */
  async start(spaceId: SpaceId, password: string): Promise<BootstrapResult> {
    const runtime = this.runtimes.get(spaceId);
    if (runtime === undefined) return { ok: false, failure: 'space' };
    const result = await bootstrapConnection(runtime.connection, password, this.deps.log);
    if (!result.ok) return result;
    runtime.live.start();
    await runtime.runner.run();
    return result;
  }

  pause(spaceId: SpaceId): void {
    const runtime = this.runtimes.get(spaceId);
    if (runtime === undefined) return;
    runtime.live.stop();
    runtime.connection.setState('paused');
  }

  resume(spaceId: SpaceId): void {
    const runtime = this.runtimes.get(spaceId);
    if (runtime === undefined || runtime.connection.keys === null) return;
    runtime.connection.setState(runtime.connection.writable ? 'idle' : 'readonly');
    runtime.live.start();
    void runtime.runner.run();
  }

  /** Остановка подключения: канал закрыт, таймеры сняты, ключи забыты. */
  stop(spaceId: SpaceId): void {
    const runtime = this.runtimes.get(spaceId);
    if (runtime === undefined) return;
    runtime.live.stop();
    runtime.watcher.stop();
    void runtime.connection.index.flush();
    runtime.connection.index.dispose();
    runtime.connection.forgetKeys();
    runtime.connection.setState('idle');
  }

  stopAll(): void {
    for (const spaceId of this.runtimes.keys()) this.stop(spaceId);
  }

  remove(spaceId: SpaceId): void {
    this.stop(spaceId);
    this.runtimes.delete(spaceId);
  }

  /** Ручная синхронизация: одно подключение или все сразу. */
  syncNow(spaceId?: SpaceId): Promise<RunReport[]> {
    const targets =
      spaceId === undefined ? this.all() : [this.runtimes.get(spaceId)].filter(isRuntime);
    return Promise.all(targets.map((runtime) => runtime.runner.run()));
  }

  /** События хранилища расходятся по всем подключениям: путь разберёт каждое само. */
  noteChange(path: string): void {
    for (const runtime of this.runtimes.values()) runtime.watcher.noteChange(path);
  }

  noteRename(oldPath: string, newPath: string, stat: Omit<LocalFile, 'path'> | null): void {
    for (const runtime of this.runtimes.values()) runtime.watcher.noteRename(oldPath, newPath, stat);
  }
}

function isRuntime(runtime: ConnectionRuntime | undefined): runtime is ConnectionRuntime {
  return runtime !== undefined;
}
