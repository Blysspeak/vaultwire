/** Боковая панель и строка состояния. Раздел 8 спецификации. */

export { PANEL_TABS, VW_PANEL_VIEW_TYPE } from './types';
export type { PanelActions, PanelHost, PanelTab, PanelTabView } from './types';

export { StatusStore, sameStatus } from './store';
export type { StatusListener } from './store';

export { pickConnection, resolveActive, scopeStatus } from './scope';

export { VaultwirePanelView } from './view';
export { STATE_ICONS, VaultwireStatusBar } from './status-bar';

export { createActivityTab } from './tab-activity';
export { createConflictsTab } from './tab-conflicts';
export { createTrashTab } from './tab-trash';
export { openSideBySide } from './open-both';
