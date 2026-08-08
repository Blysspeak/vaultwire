import { t } from '../../i18n/ru';

/**
 * Неприметная ссылка на вкладку настроек плагина. Оперативные действия живут в
 * панели, а в настройках остаются пределы, токен сервера и диагностика.
 */
export function renderFooter(parent: HTMLElement, open: () => void): HTMLElement {
  const el = parent.createDiv({ cls: 'vw-panel-foot' });
  const link = el.createEl('a', { cls: 'vw-panel-foot-link', text: t('panel.openSettings') });
  // Слушатель уходит вместе с элементом: панель чистит разметку через empty().
  link.addEventListener('click', open);
  return el;
}
