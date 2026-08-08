import { ButtonComponent, Modal, type App } from 'obsidian';
import { t } from '../../i18n/ru';
import { infoRow } from './rows';
import { formatBytes } from './summary';
import type { PlanEntry, PlanSummary } from './summary';

export interface PlanPreviewDeps {
  readonly app: App;
  readonly summary: PlanSummary;
  /** Папка подключения в том виде, в каком её показывает мастер. */
  readonly folder: string;
  /** Сколько файлов не попало в план по пределам и фильтрам. */
  readonly skipped: number;
  readonly onConfirm: () => void;
}

/**
 * Экран предпросмотра плана (раздел 8). Единственная точка, после которой
 * мастер начинает писать: до подтверждения на диск не уходит ни один файл.
 */
export class PlanPreviewModal extends Modal {
  constructor(private readonly deps: PlanPreviewDeps) {
    super(deps.app);
  }

  override onOpen(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('vw-modal');
    this.setTitle(t('preview.title'));
    this.renderCounts(root);
    this.renderEntries(root);
    this.renderButtons(root);
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private renderCounts(root: HTMLElement): void {
    const summary = this.deps.summary;
    const card = root.createDiv({ cls: 'vw-card' });
    infoRow(card, t('preview.folder'), this.deps.folder);
    infoRow(card, t('preview.incoming'), String(summary.incoming));
    infoRow(card, t('preview.outgoing'), String(summary.outgoing));
    infoRow(card, t('preview.conflicts'), String(summary.conflicts));
    infoRow(card, t('preview.localDeletes'), String(summary.localDeletes));
    infoRow(card, t('preview.remoteDeletes'), String(summary.remoteDeletes));
    infoRow(card, t('preview.bytes'), formatBytes(summary.bytes));
    if (this.deps.skipped > 0) {
      infoRow(card, t('preview.skipped'), String(this.deps.skipped));
    }
  }

  private renderEntries(root: HTMLElement): void {
    const summary = this.deps.summary;
    if (summary.total === 0) {
      root.createDiv({ cls: 'vw-note', text: t('preview.empty') });
      return;
    }
    const list = root.createDiv({ cls: 'vw-plan-list' });
    for (const entry of summary.entries) renderEntry(list, entry);
    const rest = summary.total - summary.entries.length;
    if (rest > 0) list.createDiv({ cls: 'vw-note', text: t('preview.more', { count: rest }) });
  }

  private renderButtons(root: HTMLElement): void {
    const row = root.createDiv({ cls: 'modal-button-container' });
    new ButtonComponent(row).setButtonText(t('preview.cancel')).onClick(() => {
      this.close();
    });
    new ButtonComponent(row)
      .setButtonText(t('preview.apply'))
      .setCta()
      .onClick(() => {
        this.close();
        this.deps.onConfirm();
      });
  }
}

function renderEntry(list: HTMLElement, entry: PlanEntry): void {
  const row = list.createDiv({ cls: 'vw-plan-row' });
  row.createSpan({ cls: 'vw-plan-kind', text: t(`preview.entry.${entry.kind}`) });
  row.createSpan({ cls: 'vw-plan-path', text: entry.path });
}
