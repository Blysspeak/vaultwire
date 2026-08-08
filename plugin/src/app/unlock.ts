import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n/ru';
import type { ConnectionSettings } from '../settings/types';
import type { SyncManager } from '../sync';
import { failureKey } from '../ui/owner/create-space-validate';

export interface UnlockDeps {
  readonly app: App;
  readonly manager: SyncManager;
  readonly connection: ConnectionSettings;
  /** Успешный старт; отмена окна сюда не приходит. */
  onDone(): void;
}

/**
 * Пароль шифрования на диск не попадает никогда, поэтому после каждого запуска
 * Obsidian подключение стоит без ключей и ждёт ввода. Окно спрашивает его один
 * раз на подключение и сразу запускает первый прогон.
 */
export class UnlockModal extends Modal {
  private password = '';
  private submit: ButtonComponent | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(private readonly deps: UnlockDeps) {
    super(deps.app);
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('unlock.title'));
    contentEl.addClass('vw-modal');
    contentEl.createDiv({
      cls: 'vw-note',
      text: `${t('unlock.space')}: ${this.deps.connection.label}`,
    });

    new Setting(contentEl)
      .setName(t('unlock.password.name'))
      .setDesc(t('unlock.password.desc'))
      .addText((field) => {
        field.inputEl.type = 'password';
        field.onChange((value) => {
          this.password = value;
        });
      });

    this.statusEl = contentEl.createDiv({ cls: 'vw-modal-status' });
    const actions = contentEl.createDiv({ cls: 'vw-modal-actions' });
    new ButtonComponent(actions).setButtonText(t('unlock.later')).onClick(() => {
      this.close();
    });
    const submit = new ButtonComponent(actions);
    this.submit = submit;
    submit
      .setButtonText(t('unlock.submit'))
      .setCta()
      .onClick(() => {
        void this.run();
      });
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async run(): Promise<void> {
    if (this.password.length === 0) {
      this.statusEl?.setText(t('unlock.error.empty'));
      return;
    }
    this.submit?.setDisabled(true);
    const result = await this.deps.manager.start(this.deps.connection.spaceId, this.password);
    if (!result.ok) {
      this.submit?.setDisabled(false);
      const reason = t(failureKey(result.failure ?? 'transport'));
      this.statusEl?.setText(t('notice.unlockFailed', { reason }));
      return;
    }
    // Автосинхронизация выключена — ключи выведены, но канал и опрос стоят.
    if (!this.deps.connection.autoSync) this.deps.manager.pause(this.deps.connection.spaceId);
    this.close();
    new Notice(t('notice.unlocked', { label: this.deps.connection.label }));
    this.deps.onDone();
  }
}

/** Подключения без ключей: пароль не введён, прогон невозможен. */
export function lockedConnections(
  manager: SyncManager,
  connections: readonly ConnectionSettings[],
): ConnectionSettings[] {
  return connections.filter((item) => {
    const connection = manager.connection(item.spaceId);
    return connection === undefined || connection.keys === null;
  });
}

/**
 * Цепочка разблокировки: окна идут по одному. Отмена обрывает цепочку целиком —
 * навязывать ввод пароля на старте нельзя, работа в хранилище не блокируется.
 */
export function unlockChain(
  app: App,
  manager: SyncManager,
  queue: readonly ConnectionSettings[],
  onDone: () => void,
): void {
  const [first, ...rest] = queue;
  if (first === undefined) return;
  new UnlockModal({
    app,
    manager,
    connection: first,
    onDone: () => {
      onDone();
      unlockChain(app, manager, rest, onDone);
    },
  }).open();
}
