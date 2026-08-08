import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import { t } from '../i18n/ru';
import { LOG_LEVELS, type LogLevel } from '../log';
import type VaultwirePlugin from '../main';
import { renderConnectionsList } from './connections-list';
import { SETTINGS_BOUNDS } from './defaults';

const MB = 1024 * 1024;

export class VaultwireSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: VaultwirePlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass('vw-settings');
    // Общая секция сверху идёт без заголовка (раздел 8).
    renderConnectionsList(root, this.plugin.settings.connections);
    this.renderLimits(root);
    this.renderServer(root);
    this.renderDiagnostics(root);
  }

  private renderLimits(root: HTMLElement): void {
    const settings = this.plugin.settings;
    new Setting(root).setName(t('settings.limits.heading')).setHeading();

    new Setting(root)
      .setName(t('settings.maxFileSize.name'))
      .setDesc(t('settings.maxFileSize.desc'))
      .addText((text) => {
        text.setValue(String(Math.round(settings.maxFileBytes / MB)));
        text.onChange(async (raw) => {
          const bytes = bounded(
            Number(raw) * MB,
            SETTINGS_BOUNDS.maxFileBytesMin,
            SETTINGS_BOUNDS.maxFileBytesMax,
          );
          if (bytes === null) return;
          settings.maxFileBytes = bytes;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName(t('settings.concurrency.name'))
      .setDesc(t('settings.concurrency.desc'))
      .addSlider((slider) => {
        slider
          .setLimits(SETTINGS_BOUNDS.concurrencyMin, SETTINGS_BOUNDS.concurrencyMax, 1)
          .setValue(settings.concurrency)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.concurrency = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(root)
      .setName(t('settings.pollInterval.name'))
      .setDesc(t('settings.pollInterval.desc'))
      .addText((text) => {
        text.setValue(String(Math.round(settings.pollIntervalMs / 1000)));
        text.onChange(async (raw) => {
          const ms = bounded(
            Number(raw) * 1000,
            SETTINGS_BOUNDS.pollIntervalMsMin,
            SETTINGS_BOUNDS.pollIntervalMsMax,
          );
          if (ms === null) return;
          settings.pollIntervalMs = ms;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderServer(root: HTMLElement): void {
    new Setting(root).setName(t('settings.server.heading')).setHeading();
    new Setting(root)
      .setName(t('settings.bootstrapToken.name'))
      .setDesc(t('settings.bootstrapToken.desc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setValue(this.plugin.settings.bootstrapToken);
        text.onChange(async (raw) => {
          this.plugin.settings.bootstrapToken = raw.trim();
          await this.plugin.saveSettings();
        });
      });
  }

  private renderDiagnostics(root: HTMLElement): void {
    new Setting(root).setName(t('settings.diagnostics.heading')).setHeading();

    new Setting(root)
      .setName(t('settings.logLevel.name'))
      .setDesc(t('settings.logLevel.desc'))
      .addDropdown((dropdown) => {
        for (const level of LOG_LEVELS) dropdown.addOption(level, t(`log.level.${level}`));
        dropdown.setValue(this.plugin.settings.logLevel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.logLevel = value as LogLevel;
          await this.plugin.saveSettings();
        });
      });

    new Setting(root)
      .setName(t('settings.copyLog.name'))
      .setDesc(t('settings.copyLog.desc'))
      .addButton((button) => {
        button.setButtonText(t('settings.copyLog.button'));
        button.onClick(() => {
          void this.copyDiagnostics();
        });
      });
  }

  private async copyDiagnostics(): Promise<void> {
    const report = this.plugin.diagnostics();
    if (report.length === 0) {
      new Notice(t('notice.logEmpty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(report);
      new Notice(t('notice.logCopied'));
    } catch {
      this.plugin.log.warn('settings', 'буфер обмена недоступен');
      new Notice(t('notice.logCopyFailed'));
    }
  }
}

/** Число в допустимых границах либо null, если введён мусор. */
function bounded(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}
