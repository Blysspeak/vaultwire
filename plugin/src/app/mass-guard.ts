import type { SpaceId } from '@vaultwire/shared';
import type { App } from 'obsidian';
import type { SyncManager } from '../sync';
import { BulkDeleteModal } from '../ui/connect/confirm-bulk';

/**
 * Порог массовых операций раздела 6: прогон останавливается и кладёт massCheck
 * в отчёт. Спросить человека некому — прогон дёргают таймер, события хранилища
 * и живой канал, поэтому отчёты просматриваются здесь, по тику строки состояния.
 */
export class MassGuard {
  /** Момент отчёта, по которому уже спрашивали: повторно окно не всплывает. */
  private readonly asked = new Map<SpaceId, number>();

  constructor(
    private readonly app: App,
    private readonly manager: () => SyncManager | null,
  ) {}

  check(): void {
    const manager = this.manager();
    if (manager === null) return;
    for (const runtime of manager.all()) {
      const spaceId = runtime.connection.spaceId;
      const report = runtime.connection.lastReport;
      const check = report?.massCheck ?? null;
      if (report === null || check === null) {
        this.asked.delete(spaceId);
        continue;
      }
      if (this.asked.get(spaceId) === report.at) continue;
      this.asked.set(spaceId, report.at);
      new BulkDeleteModal({
        app: this.app,
        check,
        onConfirm: () => {
          runtime.connection.allowMassOnce();
          void manager.syncNow(spaceId);
        },
      }).open();
    }
  }
}
