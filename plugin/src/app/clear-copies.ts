import type { App } from 'obsidian';
import { findConflictCopies, ObsidianConflictFiles } from '../conflicts/vault-files';
import type { SyncManager } from '../sync';
import type { ConflictRegistries } from './registries';

/**
 * Команда «убрать конфликтные копии» из раздела 8. Чужие копии приезжают обычной
 * синхронизацией и в реестре не значатся, поэтому список собирается ещё и по
 * имени файла. Всё уходит в корзину, а не удаляется мимо неё.
 */
export async function clearConflictCopies(
  app: App,
  manager: SyncManager,
  registries: ConflictRegistries,
): Promise<number> {
  const files = new ObsidianConflictFiles(app);
  let removed = 0;
  for (const runtime of manager.all()) {
    const spaceId = runtime.connection.spaceId;
    const paths = findConflictCopies(app, runtime.connection.folder);
    removed += (await registries.ensure(spaceId).clearCopies(files, paths)).length;
  }
  return removed;
}
