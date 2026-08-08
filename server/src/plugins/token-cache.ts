import { createHash } from 'node:crypto';
import type { DeviceId, Role, SpaceId } from '@vaultwire/shared';

/** Срок жизни проверенного токена в памяти, раздел 5 спецификации. */
export const AUTH_CACHE_TTL_MS = 60_000;

/** Выше этого числа записей чистим просроченные, иначе кэш растёт вместе с отозванными. */
const CACHE_PRUNE_THRESHOLD = 1_000;

export type AuthenticatedDevice = {
  deviceId: DeviceId;
  spaceId: SpaceId;
  role: Role;
};

type CacheEntry = {
  device: AuthenticatedDevice;
  expiresAt: number;
};

/** Токены и коды инвайтов хранятся и сравниваются только хешами. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class TokenCache {
  readonly #byHash = new Map<string, CacheEntry>();
  readonly #hashByDevice = new Map<string, string>();

  get(tokenHash: string, now: number = Date.now()): AuthenticatedDevice | null {
    const entry = this.#byHash.get(tokenHash);
    if (entry === undefined) return null;
    if (entry.expiresAt <= now) {
      this.#drop(tokenHash);
      return null;
    }
    return entry.device;
  }

  set(tokenHash: string, device: AuthenticatedDevice, now: number = Date.now()): void {
    if (this.#byHash.size >= CACHE_PRUNE_THRESHOLD) this.#prune(now);
    this.#byHash.set(tokenHash, { device, expiresAt: now + AUTH_CACHE_TTL_MS });
    this.#hashByDevice.set(device.deviceId, tokenHash);
  }

  /** Отзыв устройства обязан чистить кэш немедленно, ждать истечения нельзя. */
  forgetDevice(deviceId: DeviceId): void {
    const tokenHash = this.#hashByDevice.get(deviceId);
    if (tokenHash === undefined) return;
    this.#drop(tokenHash);
  }

  clear(): void {
    this.#byHash.clear();
    this.#hashByDevice.clear();
  }

  #drop(tokenHash: string): void {
    const entry = this.#byHash.get(tokenHash);
    this.#byHash.delete(tokenHash);
    if (entry !== undefined) this.#hashByDevice.delete(entry.device.deviceId);
  }

  #prune(now: number): void {
    for (const [tokenHash, entry] of this.#byHash) {
      if (entry.expiresAt <= now) this.#drop(tokenHash);
    }
  }
}
