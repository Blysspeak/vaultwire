import { Notice } from 'obsidian';
import { t } from '../i18n/ru';
import { ConfirmModal } from '../ui/confirm';
import { requireManager } from './actions';
import type { ConnectionsDeps } from './actions';
import { ConnectionSettingsModal } from './connection-settings';
import type { ConnectionSettings } from './types';

/** Ручная синхронизация одного подключения. */
export function syncConnection(deps: ConnectionsDeps, connection: ConnectionSettings): void {
  const manager = requireManager(deps);
  if (manager === null) return;
  new Notice(t('notice.syncStarted'));
  void manager.syncNow(connection.spaceId).then(() => {
    deps.refresh();
  });
}

/**
 * Пауза и возобновление. Флаг autoSync переживает перезапуск, поэтому меняется
 * вместе с состоянием реестра: иначе пауза забывалась бы при следующем запуске.
 */
export function toggleConnection(deps: ConnectionsDeps, connection: ConnectionSettings): void {
  const paused = connection.autoSync;
  connection.autoSync = !paused;
  const manager = deps.actions.manager();
  if (paused) manager?.pause(connection.spaceId);
  else manager?.resume(connection.spaceId);
  void deps.save().then(() => {
    new Notice(paused ? t('notice.paused') : t('notice.resumed'));
    deps.refresh();
  });
}

export function configureConnection(deps: ConnectionsDeps, connection: ConnectionSettings): void {
  new ConnectionSettingsModal(deps.app, {
    connection,
    save: () => deps.save(),
    onSaved: () => {
      new Notice(t('notice.connectionSaved'));
      deps.refresh();
    },
  }).open();
}

/**
 * Отключение пространства. Подтверждается набором идентификатора: кнопка стоит
 * рядом с обычными, а промах по ней стоил бы всей истории синхронизации.
 * Файлы на диске остаются нетронутыми, уходит только привязка.
 */
export function disconnectConnection(deps: ConnectionsDeps, connection: ConnectionSettings): void {
  new ConfirmModal(
    deps.app,
    {
      title: t('disconnect.title'),
      body: t('disconnect.body'),
      confirmText: t('settings.connections.disconnect'),
      requiredText: connection.spaceId,
      prompt: t('disconnect.prompt'),
    },
    () => {
      deps.actions.manager()?.remove(connection.spaceId);
      const index = deps.settings.connections.indexOf(connection);
      if (index >= 0) deps.settings.connections.splice(index, 1);
      void deps.save().then(() => {
        new Notice(t('notice.disconnected'));
        deps.refresh();
      });
    },
  ).open();
}
