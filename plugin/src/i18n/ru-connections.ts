/** Строки карточек подключений, настроек подключения и подтверждений. */
export const RU_CONNECTIONS = {
  'common.cancel': 'Отмена',
  'common.save': 'Сохранить',
  'common.confirm': 'Подтвердить',
  'common.unknown': 'неизвестно',
  'common.loading': 'Загрузка…',

  /** Состояния подключения (state.*) и единицы объёма (unit.*) лежат в ядре словаря. */
  'settings.connections.state': 'Состояние',
  'settings.connections.spaceId': 'Идентификатор',
  'settings.connections.sync': 'Синхронизировать',
  'settings.connections.pause': 'Пауза',
  'settings.connections.resume': 'Возобновить',
  'settings.connections.configure': 'Настройки подключения',
  'settings.connections.disconnect': 'Отключить',
  /** Подпись кнопки мастера подключения лежит в его же разделе: connect.open. */
  'settings.connections.create': 'Создать пространство',
  'settings.connections.connectDesc': 'Код подключения выдаёт владелец пространства.',
  'settings.connections.createDesc': 'Новое пространство на сервере из выбранной папки.',

  'connSettings.title': 'Настройки подключения',
  'connSettings.include.name': 'Маски включения',
  'connSettings.include.desc': 'По одной на строку. Пусто — берётся всё, кроме исключений.',
  'connSettings.exclude.name': 'Маски исключения',
  'connSettings.exclude.desc': 'По одной на строку. Папки .obsidian и .trash исключены всегда.',
  'connSettings.maxFileSize.name': 'Лимит размера файла, МБ',
  'connSettings.maxFileSize.desc': 'Пусто — берётся общий лимит плагина.',
  'connSettings.strategy.name': 'Стратегия конфликтов',
  'connSettings.strategy.desc': 'Что делать, когда файл изменён и локально, и на сервере.',
  'connSettings.autoSync.name': 'Автосинхронизация',
  'connSettings.autoSync.desc': 'Выключено — синхронизация только по команде.',

  'strategy.copy': 'конфликтная копия',
  'strategy.merge': 'слияние markdown',
  'strategy.newest': 'побеждает свежий',

  'disconnect.title': 'Отключить пространство',
  'disconnect.body': 'Локальные файлы останутся на месте, из плагина уйдёт только подключение.',
  'disconnect.prompt': 'Введите идентификатор пространства, чтобы подтвердить',
  'confirm.prompt': 'Введите значение для подтверждения',

  'notice.connectionSaved': 'Настройки подключения сохранены.',
  'notice.disconnected': 'Подключение удалено.',
  'notice.paused': 'Подключение приостановлено.',
  'notice.resumed': 'Подключение возобновлено.',
  'notice.syncStarted': 'Синхронизация запущена.',
  'notice.connectNotReady': 'Мастер подключения ещё не подключён.',
  'notice.copyFailed': 'Не удалось скопировать.',
} as const;
