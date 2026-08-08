import type { App } from 'obsidian';

/**
 * «Открыть обе рядом»: серверная версия в текущей области, конфликтная копия в
 * соседней. Разделение вертикальное — тексты сравнивают колонками, а не строками.
 */
export async function openSideBySide(app: App, left: string, right: string): Promise<boolean> {
  const first = app.vault.getFileByPath(left);
  const second = app.vault.getFileByPath(right);
  if (first === null || second === null) return false;
  await app.workspace.getLeaf(false).openFile(first);
  await app.workspace.getLeaf('split', 'vertical').openFile(second);
  return true;
}
