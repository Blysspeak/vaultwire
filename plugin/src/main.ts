import { apiVersion, Notice, Platform, Plugin, type TAbstractFile } from 'obsidian';
import { buildDiagnostics } from './diagnostics';
import { t } from './i18n/ru';
import { RingLog } from './log';
import { createDefaultSettings } from './settings/defaults';
import { VaultwireSettingTab } from './settings/tab';
import type { VaultwireSettings } from './settings/types';

/** Период перерисовки строки состояния, мс. */
const STATUS_REFRESH_MS = 5_000;

export default class VaultwirePlugin extends Plugin {
  override settings: VaultwireSettings = createDefaultSettings();
  readonly log = new RingLog();

  private statusBar: HTMLElement | null = null;
  /** Локальные изменения, замеченные с последней синхронизации. */
  private pendingLocal = 0;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.log.info('plugin', 'загрузка', { version: this.manifest.version });

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass('vw-status');
    this.registerDomEvent(this.statusBar, 'click', () => {
      this.openPanel();
    });
    this.renderStatus();

    this.addSettingTab(new VaultwireSettingTab(this.app, this));

    // Горячие клавиши по умолчанию не назначаются, поле hotkeys не задаём.
    this.addCommand({
      id: 'sync-now',
      name: t('cmd.syncNow'),
      callback: () => {
        this.syncNow();
      },
    });
    this.addCommand({
      id: 'open-panel',
      name: t('cmd.openPanel'),
      callback: () => {
        this.openPanel();
      },
    });
    this.addCommand({
      id: 'show-conflicts',
      name: t('cmd.showConflicts'),
      callback: () => {
        this.openPanel('conflicts');
      },
    });

    this.registerInterval(
      window.setInterval(() => {
        this.renderStatus();
      }, STATUS_REFRESH_MS),
    );

    // События хранилища регистрируются только после готовности раскладки:
    // до неё Obsidian досылает create на каждый файл при индексации.
    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
    });
  }

  override onunload(): void {
    // Листы панели не отцепляем: Obsidian восстанавливает их сам при обновлении.
    this.log.info('plugin', 'выгрузка');
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.log.setMinLevel(this.settings.logLevel);
    this.renderStatus();
  }

  /** Отчёт для поддержки, без секретов и содержимого заметок. */
  diagnostics(): string {
    return buildDiagnostics(this.settings, this.log, {
      pluginVersion: this.manifest.version,
      appVersion: apiVersion,
      mobile: Platform.isMobile,
    });
  }

  private async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<VaultwireSettings> | null;
    this.settings = { ...createDefaultSettings(), ...(stored ?? {}) };
    this.log.setMinLevel(this.settings.logLevel);
  }

  private registerVaultEvents(): void {
    const vault = this.app.vault;
    this.registerEvent(vault.on('create', (file) => this.noteLocalChange('create', file)));
    this.registerEvent(vault.on('modify', (file) => this.noteLocalChange('modify', file)));
    this.registerEvent(vault.on('delete', (file) => this.noteLocalChange('delete', file)));
    this.registerEvent(vault.on('rename', (file, oldPath) => {
      this.noteLocalChange('rename', file, oldPath);
    }));
    this.log.debug('vault', 'события хранилища подключены');
  }

  private noteLocalChange(op: string, file: TAbstractFile, oldPath?: string): void {
    if (this.settings.connections.length === 0) return;
    this.pendingLocal += 1;
    this.log.debug('vault', op, oldPath === undefined ? { path: file.path } : { path: file.path, oldPath });
    this.renderStatus();
  }

  private syncNow(): void {
    if (this.settings.connections.length === 0) {
      this.log.warn('sync', 'синхронизация без подключений');
      new Notice(t('notice.noConnections'));
      return;
    }
    this.log.info('sync', 'запрошена ручная синхронизация');
    new Notice(t('notice.engineNotReady'));
  }

  private openPanel(tab?: string): void {
    this.log.info('ui', 'запрошена панель', tab === undefined ? undefined : { tab });
    new Notice(t('notice.panelNotReady'));
  }

  private renderStatus(): void {
    const status = this.statusBar;
    if (status === null) return;
    if (this.settings.connections.length === 0) {
      status.setText(t('status.noConnections'));
      return;
    }
    status.setText(
      this.pendingLocal === 0
        ? t('status.idle')
        : t('status.pending', { count: this.pendingLocal }),
    );
  }
}
