import type { DocId } from '@vaultwire/shared';
import { computeDocId } from '../crypto';
import type { KeyBundle } from '../crypto';

/**
 * Кеш адресов документов. docId детерминирован от пути и ключа, поэтому
 * считается один раз на путь и живёт до смены ключей.
 */
export class DocIdCache {
  private readonly ids = new Map<string, DocId>();

  clear(): void {
    this.ids.clear();
  }

  async resolve(keys: KeyBundle, paths: readonly string[]): Promise<ReadonlyMap<string, DocId>> {
    const missing = [...new Set(paths)].filter((path) => !this.ids.has(path));
    const computed = await Promise.all(missing.map((path) => computeDocId(keys.pathKey, path)));
    missing.forEach((path, i) => {
      const docId = computed[i];
      if (docId !== undefined) this.ids.set(path, docId);
    });
    return this.ids;
  }
}
