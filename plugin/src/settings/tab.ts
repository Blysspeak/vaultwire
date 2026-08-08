import { PluginSettingTab, Setting, type App } from 'obsidian';
import { t } from '../i18n/ru';
import type VaultwirePlugin from '../main';
import { NO_ACTIONS } from './actions';
import type { ConnectionsDeps, SettingsActions } from './actions';
import { renderConnectionsSection } from './connections-section';
import { SETTINGS_BOUNDS } from './defaults';
import { renderDiagnosticsSection } from './diagnostics-section';

const MB = 1024 * 1024;

export class VaultwireSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: VaultwirePlugin,
    /** Движок и мастер подключения приезжают из main.ts после их сборки. */
    private readonly actions: SettingsActions = NO_ACTIONS,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass('vw-settings');
    // Общая секция сверху идёт без заголовка (раздел 8).
    renderConnectionsSection(root, this.connectionsDeps());
    this.renderLimits(root);
    this.renderServer(root);
    this.renderDiagnostics(root);
  }

  private connectionsDeps(): ConnectionsDeps {
    return {
      app: this.app,
      settings: this.plugin.settings,
      actions: this.actions,
      save: () => this.plugin.saveSettings(),
      refresh: () => {
        this.display();
      },
    };
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
          const had = this.plugin.settings.bootstrapToken.length > 0;
          this.plugin.settings.bootstrapToken = raw.trim();
          await this.plugin.saveSettings();
          // Кнопка создания пространства живёт выше по странице и зависит от
          // наличия токена. Перерисовываем ровно в момент смены признака, а не
          // на каждый символ: иначе ввод рвётся на первом же нажатии.
          const has = this.plugin.settings.bootstrapToken.length > 0;
          if (had !== has) this.display();
        });
      });
  }

  private renderDiagnostics(root: HTMLElement): void {
    renderDiagnosticsSection(root, {
      settings: this.plugin.settings,
      log: this.plugin.log,
      report: () => this.plugin.diagnostics(),
      save: () => this.plugin.saveSettings(),
    });
  }
}

/** Число в допустимых границах либо null, если введён мусор. */
function bounded(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}
