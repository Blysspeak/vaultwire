/**
 * Все видимые строки интерфейса. Единственный источник текстов: английский
 * добавляется вторым словарём без раскопок по коду.
 */
export const RU = {
  'cmd.syncNow': 'Синхронизировать сейчас',
  'cmd.openPanel': 'Открыть панель',
  'cmd.showConflicts': 'Показать конфликты',

  'status.noConnections': 'vaultwire: нет подключений',
  'status.idle': 'vaultwire: ожидание',
  'status.pending': 'vaultwire: локальных изменений {count}',

  'notice.noConnections': 'Подключений нет. Добавьте пространство в настройках.',
  'notice.engineNotReady': 'Движок синхронизации ещё не подключён.',
  'notice.panelNotReady': 'Панель ещё не подключена.',
  'notice.logCopied': 'Журнал скопирован в буфер обмена.',
  'notice.logCopyFailed': 'Не удалось скопировать журнал.',
  'notice.logEmpty': 'Журнал пуст.',

  'settings.connections.empty': 'Подключений нет.',
  'settings.connections.folder': 'Папка',
  'settings.connections.folderRoot': 'корень хранилища',
  'settings.connections.server': 'Сервер',
  'settings.connections.role': 'Роль',
  'settings.connections.lastSync': 'Синхронизация',
  'settings.connections.never': 'ни разу',
  'settings.connections.paused': 'приостановлено',

  'role.owner': 'владелец',
  'role.rw': 'чтение и запись',
  'role.ro': 'только чтение',

  'settings.limits.heading': 'Пределы',
  'settings.maxFileSize.name': 'Максимальный размер файла, МБ',
  'settings.maxFileSize.desc': 'Файлы крупнее пропускаются с записью в панель.',
  'settings.concurrency.name': 'Одновременных передач',
  'settings.concurrency.desc': 'Сколько документов передаются параллельно.',
  'settings.pollInterval.name': 'Период опроса, секунд',
  'settings.pollInterval.desc': 'Запасной опрос изменений, когда WebSocket не поднялся.',

  'settings.server.heading': 'Сервер',
  'settings.bootstrapToken.name': 'Bootstrap-токен',
  'settings.bootstrapToken.desc': 'Нужен только для создания новых пространств. Пусто — создание недоступно.',

  'settings.diagnostics.heading': 'Диагностика',
  'settings.logLevel.name': 'Уровень журнала',
  'settings.logLevel.desc': 'Вывод в консоль не ведётся, журнал живёт в памяти.',
  'settings.copyLog.name': 'Экспорт диагностики',
  'settings.copyLog.desc': 'Журнал и состояние подключений без секретов и содержимого заметок.',
  'settings.copyLog.button': 'Скопировать',

  'log.level.debug': 'подробный',
  'log.level.info': 'обычный',
  'log.level.warn': 'предупреждения',
  'log.level.error': 'только ошибки',
} as const;

export type MessageKey = keyof typeof RU;

/** Подстановка вида {name}; отсутствующая переменная остаётся как есть. */
export function t(key: MessageKey, vars?: Readonly<Record<string, string | number>>): string {
  const template: string = RU[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole: string, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}
