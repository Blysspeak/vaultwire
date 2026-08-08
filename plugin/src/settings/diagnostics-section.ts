import { Notice, Setting } from 'obsidian';
import { t } from '../i18n/ru';
import { LOG_LEVELS } from '../log';
import type { LogLevel, RingLog } from '../log';
import type { VaultwireSettings } from './types';

export interface DiagnosticsDeps {
  readonly settings: VaultwireSettings;
  readonly log: RingLog;
  /** Отчёт для поддержки: журнал и состояние подключений без секретов. */
  report(): string;
  save(): Promise<void>;
}

/** Секция диагностики: уровень журнала и выгрузка отчёта в буфер обмена. */
export function renderDiagnosticsSection(root: HTMLElement, deps: DiagnosticsDeps): void {
  new Setting(root).setName(t('settings.diagnostics.heading')).setHeading();

  new Setting(root)
    .setName(t('settings.logLevel.name'))
    .setDesc(t('settings.logLevel.desc'))
    .addDropdown((dropdown) => {
      for (const level of LOG_LEVELS) dropdown.addOption(level, t(`log.level.${level}`));
      dropdown.setValue(deps.settings.logLevel);
      dropdown.onChange((value) => {
        deps.settings.logLevel = toLevel(value, deps.settings.logLevel);
        void deps.save();
      });
    });

  new Setting(root)
    .setName(t('settings.copyLog.name'))
    .setDesc(t('settings.copyLog.desc'))
    .addButton((button) => {
      button.setButtonText(t('settings.copyLog.button'));
      button.onClick(() => {
        void copyReport(deps);
      });
    });
}

async function copyReport(deps: DiagnosticsDeps): Promise<void> {
  const report = deps.report();
  if (report.length === 0) {
    new Notice(t('notice.logEmpty'));
    return;
  }
  try {
    await navigator.clipboard.writeText(report);
    new Notice(t('notice.logCopied'));
  } catch {
    deps.log.warn('settings', 'буфер обмена недоступен');
    new Notice(t('notice.logCopyFailed'));
  }
}

function toLevel(value: string, fallback: LogLevel): LogLevel {
  return LOG_LEVELS.find((level) => level === value) ?? fallback;
}
