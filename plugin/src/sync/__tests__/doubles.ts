import { deviceIdSchema, spaceIdSchema } from '@vaultwire/shared';
import { deriveKeys, toArrayBuffer, utf8Encode } from '../../crypto';
import type { KeyBundle } from '../../crypto';
import type { ScanFile } from '../../engine/scanner';
import type { ConnectionSettings } from '../../settings/types';
import type { SyncLimits, Timers, VaultReader } from '../types';

export const SPACE = spaceIdSchema.parse('space-1');
export const DEVICE = deviceIdSchema.parse('device-1');

/** Хранилище в памяти: список файлов и их тела, без единого обращения к Obsidian. */
export class FakeReader implements VaultReader {
  readonly files = new Map<string, { data: string; mtime: number; ctime: number }>();

  put(path: string, data: string, mtime = 1000): void {
    this.files.set(path, { data, mtime, ctime: 500 });
  }

  list(): readonly ScanFile[] {
    return [...this.files.entries()].map(([path, file]) => ({
      path,
      stat: { mtime: file.mtime, ctime: file.ctime, size: file.data.length },
    }));
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const file = this.files.get(path);
    if (file === undefined) throw new Error(`нет файла ${path}`);
    return toArrayBuffer(utf8Encode(file.data));
  }
}

/** Управляемые таймеры: время двигает тест, а не системные часы. */
export class FakeTimers implements Timers {
  private readonly pending = new Map<number, { run: () => void; at: number }>();
  private next = 1;
  private clock = 0;

  setTimeout(run: () => void, ms: number): number {
    const handle = this.next;
    this.next += 1;
    this.pending.set(handle, { run, at: this.clock + ms });
    return handle;
  }

  clearTimeout(handle: number): void {
    this.pending.delete(handle);
  }

  advance(ms: number): void {
    this.clock += ms;
    for (const [handle, timer] of [...this.pending.entries()]) {
      if (timer.at > this.clock) continue;
      this.pending.delete(handle);
      timer.run();
    }
  }

  get size(): number {
    return this.pending.size;
  }
}

export function connectionSettings(overrides: Partial<ConnectionSettings> = {}): ConnectionSettings {
  return {
    spaceId: SPACE,
    serverUrl: 'https://obsidian.boostix.space',
    deviceId: DEVICE,
    deviceToken: 'device-token',
    label: 'команда',
    deviceLabel: 'ноутбук',
    localFolder: 'Команда',
    role: 'rw',
    keyEpoch: 1,
    include: [],
    exclude: [],
    maxFileBytes: null,
    conflictStrategy: 'copy',
    autoSync: true,
    lastSeq: 0,
    lastSyncedAt: null,
    ...overrides,
  };
}

export const LIMITS: SyncLimits = {
  maxFileBytes: 1024 * 1024,
  concurrency: 2,
  massDeleteAbsolute: 20,
  massDeleteRatio: 0.15,
  deviceLabel: 'ноутбук',
};

/** Ключи без PBKDF2: вывод из готового master занимает микросекунды. */
export function testKeys(): Promise<KeyBundle> {
  return deriveKeys(new Uint8Array(32), 1);
}
