import type { App } from 'obsidian';

/**
 * Область frontmatter: построчное слияние YAML порождает дубли ключей и ломает
 * свойства незаметно, поэтому любая правка в этой области отменяет автослияние.
 */

/**
 * Номер первой строки после frontmatter; 0 — frontmatter нет.
 * Текстовый разбор нужен для базовой и серверной версий: metadataCache знает
 * только то, что лежит на диске прямо сейчас.
 */
export function frontmatterEndLine(text: string): number {
  const lines = text.split('\n');
  if ((lines[0] ?? '').trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() === '---') return i + 1;
  }
  // Незакрытый разделитель: frontmatter не сложился, весь текст обычный.
  return 0;
}

/**
 * То же для локального файла, но по metadataCache: Obsidian уже разобрал его
 * и знает frontmatterPosition, повторный разбор текста был бы лишним.
 */
export function frontmatterEndFromCache(app: App, vaultPath: string): number {
  const position = app.metadataCache.getCache(vaultPath)?.frontmatterPosition;
  return position === undefined ? 0 : position.end.line + 1;
}
