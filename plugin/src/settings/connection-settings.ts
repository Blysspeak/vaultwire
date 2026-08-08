import { ButtonComponent, Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { MessageKey } from '../i18n/ru';
import { linesField } from '../ui/fields';
import { SETTINGS_BOUNDS } from './defaults';
import { CONFLICT_STRATEGIES } from './types';
import type { ConflictStrategy, ConnectionSettings } from './types';

const MB = 1024 * 1024;

const STRATEGY_KEYS: Record<ConflictStrategy, MessageKey> = {
  copy: 'strategy.copy',
  merge: 'strategy.merge',
  newest: 'strategy.newest',
};

export interface ConnectionSettingsDeps {
  readonly connection: ConnectionSettings;
  save(): Promise<void>;
  onSaved(): void;
}

/** Черновик правок: пока не нажата кнопка, подключение не трогается. */
interface Draft {
  include: string[];
  exclude: string[];
  maxFileBytes: number | null;
  conflictStrategy: ConflictStrategy;
  autoSync: boolean;
}

/** Настройки одного подключения: фильтры, лимит, стратегия конфликтов, автосинк. */
export class ConnectionSettingsModal extends Modal {
  private readonly draft: Draft;

  constructor(
    app: App,
    private readonly deps: ConnectionSettingsDeps,
  ) {
    super(app);
    const connection = deps.connection;
    this.draft = {
      include: [...connection.include],
      exclude: [...connection.exclude],
      maxFileBytes: connection.maxFileBytes,
      conflictStrategy: connection.conflictStrategy,
      autoSync: connection.autoSync,
    };
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('connSettings.title'));
    contentEl.addClass('vw-modal');

    linesField(
      contentEl,
      'connSettings.include.name',
      'connSettings.include.desc',
      this.draft.include,
      (lines) => {
        this.draft.include = lines;
      },
    );
    linesField(
      contentEl,
      'connSettings.exclude.name',
      'connSettings.exclude.desc',
      this.draft.exclude,
      (lines) => {
        this.draft.exclude = lines;
      },
    );

    new Setting(contentEl)
      .setName(t('connSettings.maxFileSize.name'))
      .setDesc(t('connSettings.maxFileSize.desc'))
      .addText((field) => {
        field.setValue(this.draft.maxFileBytes === null ? '' : String(this.draft.maxFileBytes / MB));
        field.onChange((raw) => {
          this.draft.maxFileBytes = parseLimit(raw);
        });
      });

    new Setting(contentEl)
      .setName(t('connSettings.strategy.name'))
      .setDesc(t('connSettings.strategy.desc'))
      .addDropdown((dropdown) => {
        for (const strategy of CONFLICT_STRATEGIES) {
          dropdown.addOption(strategy, t(STRATEGY_KEYS[strategy]));
        }
        dropdown.setValue(this.draft.conflictStrategy);
        dropdown.onChange((value) => {
          const picked = CONFLICT_STRATEGIES.find((strategy) => strategy === value);
          if (picked !== undefined) this.draft.conflictStrategy = picked;
        });
      });

    new Setting(contentEl)
      .setName(t('connSettings.autoSync.name'))
      .setDesc(t('connSettings.autoSync.desc'))
      .addToggle((toggle) => {
        toggle.setValue(this.draft.autoSync);
        toggle.onChange((value) => {
          this.draft.autoSync = value;
        });
      });

    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('common.cancel')).onClick(() => {
      this.close();
    });
    new ButtonComponent(actions)
      .setButtonText(t('common.save'))
      .setCta()
      .onClick(() => {
        this.apply();
      });
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private apply(): void {
    const connection = this.deps.connection;
    connection.include = this.draft.include;
    connection.exclude = this.draft.exclude;
    connection.maxFileBytes = this.draft.maxFileBytes;
    connection.conflictStrategy = this.draft.conflictStrategy;
    connection.autoSync = this.draft.autoSync;
    this.close();
    void this.deps.save().then(() => {
      this.deps.onSaved();
    });
  }
}

/** Пусто — общий лимит плагина; мусор и выход за границы игнорируются. */
function parseLimit(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  const bytes = Math.round(Number(text) * MB);
  if (!Number.isFinite(bytes)) return null;
  if (bytes < SETTINGS_BOUNDS.maxFileBytesMin || bytes > SETTINGS_BOUNDS.maxFileBytesMax) return null;
  return bytes;
}
