import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { obsidianRequest } from '../api/request';
import { t } from '../i18n/ru';
import type { RingLog } from '../log';
import type { ConnectionSettings, VaultwireSettings } from '../settings/types';
import { ObsidianVaultReader } from '../sync';
import type { SyncManager } from '../sync';
import { openConnectWizard } from '../ui/connect';
import { failureKey } from '../ui/owner/create-space-validate';
import type { ConflictRegistries } from './registries';

export interface ConnectDeps {
  readonly app: App;
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  readonly manager: SyncManager;
  readonly registries: ConflictRegistries;
  save(): Promise<void>;
  /** Перерисовать вкладку настроек и строку состояния после подключения. */
  refresh(): void;
}

/**
 * Мастер подключения из раздела 8. Единственная точка записи — onApply: до
 * подтверждения плана мастер не трогает ни диск, ни настройки.
 */
export function openConnect(deps: ConnectDeps): void {
  openConnectWizard({
    app: deps.app,
    request: obsidianRequest,
    deviceLabel: deps.app.vault.getName(),
    existing: () => deps.settings.connections,
    reader: new ObsidianVaultReader(deps.app),
    maxFileBytes: () => deps.settings.maxFileBytes,
    log: deps.log,
    onApply: (settings, password) => apply(deps, settings, password),
  });
}

async function apply(
  deps: ConnectDeps,
  connection: ConnectionSettings,
  password: string,
): Promise<void> {
  await ensureFolder(deps, connection.localFolder);
  deps.settings.connections.push(connection);
  await deps.save();
  await deps.registries.load([connection.spaceId]);
  deps.manager.add(connection);
  const started = await deps.manager.start(connection.spaceId, password);
  if (started.ok && !connection.autoSync) deps.manager.pause(connection.spaceId);
  new Notice(
    started.ok
      ? t('notice.connected')
      : t('notice.unlockFailed', { reason: t(failureKey(started.failure ?? 'transport')) }),
  );
  deps.refresh();
}

async function ensureFolder(deps: ConnectDeps, folder: string): Promise<void> {
  if (folder === '') return;
  if (deps.app.vault.getFolderByPath(folder) !== null) return;
  await deps.app.vault.createFolder(folder);
}
