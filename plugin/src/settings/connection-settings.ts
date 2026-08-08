import { ButtonComponent, Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import { linesField } from '../ui/fields';
import { applyDraft, draftOf, MB, parseLimit, STRATEGY_KEYS } from './connection-draft';
import type { Draft } from './connection-draft';
import { renderRememberRow } from './connection-remember';
import { CONFLICT_STRATEGIES } from './types';
import type { ConnectionSettings } from './types';

export interface ConnectionSettingsDeps {
  readonly connection: ConnectionSettings;
  save(): Promise<void>;
  /** Включение «запомнить пароль»: спросить пароль, done — по закрытию окна. */
  requestPassword(done: () => void): void;
  onSaved(): void;
}

/** Настройки одного подключения: фильтры, лимит, стратегия конфликтов, автосинк. */
export class ConnectionSettingsModal extends Modal {
  private readonly draft: Draft;

  constructor(
    app: App,
    private readonly deps: ConnectionSettingsDeps,
  ) {
    super(app);
    this.draft = draftOf(deps.connection);
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

    renderRememberRow(contentEl, {
      connection: this.deps.connection,
      save: () => this.deps.save(),
      requestPassword: (done) => {
        this.deps.requestPassword(done);
      },
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
    applyDraft(this.deps.connection, this.draft);
    this.close();
    void this.deps.save().then(() => {
      this.deps.onSaved();
    });
  }
}
