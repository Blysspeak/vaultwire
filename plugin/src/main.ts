import { apiVersion, Platform, Plugin } from 'obsidian';
import { registerCommands } from './app/commands';
import { MassGuard } from './app/mass-guard';
import { ConflictRegistries } from './app/registries';
import { createSettingsActions, openConnectSpace } from './app/settings-actions';
import type { ActionsDeps } from './app/settings-actions';
import { startEngine } from './app/start';
import { mountPanel, mountStatusBar } from './app/surface';
import type { SurfaceDeps } from './app/surface';
import { buildDiagnostics } from './diagnostics';
import { RingLog } from './log';
import { createDefaultSettings } from './settings/defaults';
import { VaultwireSettingTab } from './settings/tab';
import type { VaultwireSettings } from './settings/types';
import { aggregateStatus, SyncManager } from './sync';
import { StatusStore } from './ui/panel/store';

/** Период перерисовки строки состояния, мс. */
const STATUS_REFRESH_MS = 5_000;

export default class VaultwirePlugin extends Plugin {
  override settings: VaultwireSettings = createDefaultSettings();
  readonly log = new RingLog();

  /** Движок поднимается на готовой раскладке, до неё его нет. */
  private manager: SyncManager | null = null;
  private store: StatusStore | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.log.info('plugin', 'загрузка', { version: this.manifest.version });

    const store = new StatusStore(() => this.manager?.status() ?? aggregateStatus([]));
    const registries = new ConflictRegistries(
      this.app.vault.adapter,
      this.app.vault.configDir,
      this.log,
    );
    this.store = store;
    const deps = this.actionsDeps(store, registries);

    const surface: SurfaceDeps = {
      app: this.app,
      plugin: this,
      store,
      registries,
      manager: () => this.manager,
    };
    mountStatusBar(surface);
    mountPanel(surface);
    this.addSettingTab(new VaultwireSettingTab(this.app, this, createSettingsActions(deps)));
    registerCommands({
      app: this.app,
      plugin: this,
      settings: this.settings,
      registries,
      manager: () => this.manager,
      connect: () => {
        openConnectSpace(deps);
      },
      refresh: deps.refresh,
      save: () => this.saveSettings(),
    });

    // Тот же тик спрашивает подтверждение массового удаления: прогон, который
    // в него упёрся, мог быть запущен таймером или событием хранилища.
    const guard = new MassGuard(this.app, () => this.manager);
    this.registerInterval(
      window.setInterval(() => {
        store.publish();
        guard.check();
      }, STATUS_REFRESH_MS),
    );

    // Любой ввод-вывод и подписки на хранилище — только на готовой раскладке:
    // до неё Obsidian досылает create на каждый файл при индексации.
    this.app.workspace.onLayoutReady(() => {
      this.manager = startEngine({
        app: this.app,
        settings: this.settings,
        log: this.log,
        registries,
        store,
        registerInterval: (run, ms) => {
          this.registerInterval(window.setInterval(run, ms));
        },
        registerEvent: (ref) => {
          this.registerEvent(ref);
        },
        save: () => this.saveSettings(),
      });
    });
  }

  override onunload(): void {
    // Листы панели не отцепляем: Obsidian восстанавливает их сам при обновлении.
    // stopAll закрывает канал, снимает таймеры, дописывает индекс и забывает ключи.
    this.manager?.stopAll();
    this.log.info('plugin', 'выгрузка');
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.log.setMinLevel(this.settings.logLevel);
    this.store?.publish();
  }

  /** Отчёт для поддержки, без секретов и содержимого заметок. */
  diagnostics(): string {
    return buildDiagnostics(this.settings, this.log, {
      pluginVersion: this.manifest.version,
      appVersion: apiVersion,
      mobile: Platform.isMobile,
    });
  }

  private actionsDeps(store: StatusStore, registries: ConflictRegistries): ActionsDeps {
    return {
      app: this.app,
      settings: this.settings,
      log: this.log,
      registries,
      manager: () => this.manager,
      save: () => this.saveSettings(),
      refresh: () => {
        store.publish();
      },
    };
  }

  private async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<VaultwireSettings> | null;
    this.settings = { ...createDefaultSettings(), ...(stored ?? {}) };
    this.log.setMinLevel(this.settings.logLevel);
  }
}
