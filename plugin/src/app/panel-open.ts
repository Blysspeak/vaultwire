import type { App, WorkspaceLeaf } from 'obsidian';
import { VW_PANEL_VIEW_TYPE } from '../ui/panel/types';
import type { PanelTab } from '../ui/panel/types';
import { VaultwirePanelView } from '../ui/panel/view';

/**
 * Открытие боковой панели. Ссылка на созданный вид нигде не хранится: лист живёт
 * своей жизнью, а нужная вкладка выбирается разово, сразу после раскрытия.
 */
export async function openPanel(app: App, tab?: PanelTab): Promise<void> {
  const leaf = await ensureLeaf(app);
  if (leaf === null) return;
  await app.workspace.revealLeaf(leaf);
  if (tab === undefined) return;
  const view = leaf.view;
  if (view instanceof VaultwirePanelView) view.select(tab);
}

async function ensureLeaf(app: App): Promise<WorkspaceLeaf | null> {
  const existing = app.workspace.getLeavesOfType(VW_PANEL_VIEW_TYPE)[0];
  if (existing !== undefined) return existing;
  const leaf = app.workspace.getRightLeaf(false);
  if (leaf === null) return null;
  await leaf.setViewState({ type: VW_PANEL_VIEW_TYPE, active: true });
  return leaf;
}
