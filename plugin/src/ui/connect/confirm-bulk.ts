import { ButtonComponent, Modal, type App } from 'obsidian';
import type { MassOperationCheck } from '../../engine/guards';
import { t } from '../../i18n/ru';

/** Сколько путей показывать в списке удаляемого; остальное сворачивается в счётчик. */
export const BULK_PATH_LIMIT = 50;

export interface BulkConfirmDeps {
  readonly app: App;
  readonly check: MassOperationCheck;
  /** Подтверждение действует ровно на один прогон: connection.allowMassOnce(). */
  readonly onConfirm: () => void;
}

/**
 * Порог массовых операций раздела 6: прогон остановлен, человеку показывается
 * список того, что будет удалено. Молча удалять нельзя — это ловит отвалившийся
 * сетевой диск и случайно удалённую папку.
 */
export class BulkDeleteModal extends Modal {
  constructor(private readonly deps: BulkConfirmDeps) {
    super(deps.app);
  }

  override onOpen(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('vw-modal');
    this.setTitle(t('bulk.title'));

    const check = this.deps.check;
    root.createDiv({
      cls: 'vw-note',
      text: t('bulk.desc', { count: check.deletions, percent: percent(check.ratio) }),
    });

    const list = root.createDiv({ cls: 'vw-plan-list' });
    for (const path of check.paths.slice(0, BULK_PATH_LIMIT)) {
      list.createDiv({ cls: 'vw-plan-path', text: path });
    }
    const rest = check.paths.length - Math.min(check.paths.length, BULK_PATH_LIMIT);
    if (rest > 0) list.createDiv({ cls: 'vw-note', text: t('bulk.more', { count: rest }) });

    this.renderButtons(root);
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private renderButtons(root: HTMLElement): void {
    const row = root.createDiv({ cls: 'modal-button-container' });
    new ButtonComponent(row).setButtonText(t('bulk.cancel')).onClick(() => {
      this.close();
    });
    new ButtonComponent(row)
      .setButtonText(t('bulk.confirm'))
      .setWarning()
      .onClick(() => {
        this.close();
        this.deps.onConfirm();
      });
  }
}

function percent(ratio: number): number {
  return Math.round(ratio * 100);
}
