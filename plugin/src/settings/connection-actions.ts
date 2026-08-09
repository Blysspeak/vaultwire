import { Notice } from 'obsidian';
import { UnlockModal } from '../app/unlock';
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
export function setConnectionPaused(
  deps: ConnectionsDeps,
  connection: ConnectionSettings,
  paused: boolean,
): void {
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
    requestPassword: (done) => {
      askPassword(deps, connection, done);
    },
    onSaved: () => {
      new Notice(t('notice.connectionSaved'));
      deps.refresh();
    },
  }).open();
}

/**
 * Запомнить пароль включают только вместе с самим паролем, а непроверенный
 * пароль хранить бессмысленно: окно разблокировки сверяет его верификатором
 * и сохраняет уже проверенным.
 */
function askPassword(deps: ConnectionsDeps, connection: ConnectionSettings, done: () => void): void {
  const manager = requireManager(deps);
  if (manager === null) {
    done();
    return;
  }
  new UnlockModal({
    app: deps.app,
    manager,
    connection,
    remember: true,
    save: () => deps.save(),
    onDone: () => {
      deps.refresh();
    },
    onClosed: done,
  }).open();
}

/**
 * Отключение пространства. Обычное подтверждение, без набора идентификатора:
 * действие обратимое, файлы на диске остаются, а подключиться заново можно тем же
 * кодом. Заставлять вручную набирать ulid ради обратимого действия — издевательство.
 */
export function disconnectConnection(deps: ConnectionsDeps, connection: ConnectionSettings): void {
  new ConfirmModal(
    deps.app,
    {
      title: t('disconnect.title'),
      body: t('disconnect.body'),
      confirmText: t('settings.connections.disconnect'),
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
