import type { IndexEntry } from './types';

/**
 * Подавление эха раздела 6. Два барьера, оба обязательны: события хранилища
 * асинхронны, и одиночного флага хватает ровно до первой гонки, после которой
 * начинается бесконечный цикл отправки и приёма.
 */

/** Страховка от зависшего флага: события modify может не быть вовсе. */
export const ECHO_TTL_MS = 10_000;

interface Mark {
  count: number;
  expiresAt: number;
}

export interface EchoOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export class EchoGuard {
  private readonly marks = new Map<string, Mark>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: EchoOptions = {}) {
    this.ttlMs = options.ttlMs ?? ECHO_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Первый барьер: путь помечается до записи принятого файла. */
  beginApply(path: string): void {
    const mark = this.marks.get(path);
    const expiresAt = this.now() + this.ttlMs;
    if (mark === undefined) this.marks.set(path, { count: 1, expiresAt });
    else {
      mark.count += 1;
      mark.expiresAt = expiresAt;
    }
  }

  /** Снимается после события modify; лишние вызовы безопасны. */
  endApply(path: string): void {
    const mark = this.marks.get(path);
    if (mark === undefined) return;
    mark.count -= 1;
    if (mark.count <= 0) this.marks.delete(path);
  }

  isApplying(path: string): boolean {
    const mark = this.marks.get(path);
    if (mark === undefined) return false;
    if (mark.expiresAt <= this.now()) {
      this.marks.delete(path);
      return false;
    }
    return true;
  }

  /** Обёртка над записью: флаг снимается даже когда запись упала. */
  async wrap<T>(path: string, write: () => Promise<T>): Promise<T> {
    this.beginApply(path);
    try {
      return await write();
    } finally {
      this.endApply(path);
    }
  }

  clear(): void {
    this.marks.clear();
  }

  /** Второй барьер: хеш совпал с индексом, значит это наша собственная запись. */
  isOwnWrite(entry: IndexEntry | undefined, plainHash: string): boolean {
    return entry !== undefined && entry.plainHash === plainHash;
  }

  /**
   * Отправлять только то, что действительно изменил пользователь:
   * путь не применяется прямо сейчас и хеш отличается от записанного в индексе.
   */
  shouldPush(path: string, plainHash: string, entry: IndexEntry | undefined): boolean {
    if (this.isApplying(path)) return false;
    return !this.isOwnWrite(entry, plainHash);
  }
}
