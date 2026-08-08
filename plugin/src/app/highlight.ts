import type { Plugin } from 'obsidian';
import { IncomingHighlight } from '../ui/explorer-highlight';

/**
 * Подсветка прилетевших изменений живёт ровно столько же, сколько плагин:
 * уборка вешается на register, висящих таймеров после выгрузки не остаётся.
 */
export function mountIncomingHighlight(plugin: Plugin): IncomingHighlight {
  const highlight = new IncomingHighlight(plugin.app);
  plugin.register(() => {
    highlight.dispose();
  });
  return highlight;
}
