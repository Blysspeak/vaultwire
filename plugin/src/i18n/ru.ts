import { RU_APP } from './ru-app';
import { RU_CONNECT } from './ru-connect';
import { RU_CONNECTIONS } from './ru-connections';
import { RU_OWNER } from './ru-owner';
import { RU_PANEL } from './ru-panel';

/**
 * Все видимые строки интерфейса. Единственный источник текстов: английский
 * добавляется вторым словарём без раскопок по коду. Словарь разбит по разделам,
 * чтобы ни один файл не перерос предел в 150 строк.
 */
const RU_CORE = {
  'cmd.syncNow': 'Синхронизировать сейчас',
  'cmd.openPanel': 'Открыть панель',
  'cmd.showConflicts': 'Показать конфликты',

  /** Подписи строки состояния живут в разделе панели: statusbar.* и state.*. */
  'notice.noConnections': 'Подключений нет. Добавьте пространство в настройках.',
  'notice.engineNotReady': 'Движок синхронизации ещё не подключён.',
  'notice.logCopied': 'Журнал скопирован в буфер обмена.',
  'notice.logCopyFailed': 'Не удалось скопировать журнал.',
  'notice.logEmpty': 'Журнал пуст.',

  'settings.openPanel': 'Открыть панель',
  'settings.connections.empty': 'Подключений нет.',
  'settings.connections.managedInPanel':
    'Подключение, создание и управление живут в боковой панели.',
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

  'unit.b': '{count} Б',
  'unit.kb': '{count} КБ',
  'unit.mb': '{count} МБ',
  'unit.gb': '{count} ГБ',
  'unit.bytes': '{count} Б',
  'unit.kilobytes': '{count} КБ',
  'unit.megabytes': '{count} МБ',
} as const;

export const RU = {
  ...RU_CORE,
  ...RU_APP,
  ...RU_CONNECT,
  ...RU_CONNECTIONS,
  ...RU_OWNER,
  ...RU_PANEL,
};

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
