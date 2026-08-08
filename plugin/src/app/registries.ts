import type { SpaceId } from '@vaultwire/shared';
import { ConflictRegistry } from '../conflicts/registry';
import type { StateAdapter } from '../engine/state-file';
import type { RingLog } from '../log';

/**
 * Реестры незакрытых конфликтов, по одному на подключение. Отдельный объект,
 * а не поле подключения: панель читает их синхронно и без движка, а прогон
 * только дописывает. Чтение с диска однократное, при подъёме подключений.
 */
export class ConflictRegistries {
  private readonly map = new Map<SpaceId, ConflictRegistry>();

  constructor(
    private readonly adapter: StateAdapter,
    private readonly configDir: string,
    private readonly log: RingLog,
  ) {}

  ensure(spaceId: SpaceId): ConflictRegistry {
    const existing = this.map.get(spaceId);
    if (existing !== undefined) return existing;
    const registry = new ConflictRegistry(this.adapter, this.configDir, spaceId);
    this.map.set(spaceId, registry);
    return registry;
  }

  get(spaceId: SpaceId): ConflictRegistry | undefined {
    return this.map.get(spaceId);
  }

  forget(spaceId: SpaceId): void {
    this.map.delete(spaceId);
  }

  /** Битый или недоступный реестр не должен ронять подключение: панель просто пуста. */
  async load(spaceIds: readonly SpaceId[]): Promise<void> {
    for (const spaceId of spaceIds) {
      try {
        await this.ensure(spaceId).load();
      } catch (error) {
        this.log.warn('conflicts', 'реестр не прочитался', {
          space: spaceId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
