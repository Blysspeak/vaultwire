/** Строки сборки плагина: команды, разблокировка подключений, уборка копий. */
export const RU_APP = {
  'cmd.connectSpace': 'Подключить пространство',
  'cmd.clearConflictCopies': 'Убрать конфликтные копии',
  'cmd.unlock': 'Ввести пароль подключения',

  'unlock.title': 'Пароль подключения',
  'unlock.space': 'Подключение',
  'unlock.password.name': 'Пароль шифрования',
  'unlock.password.desc': 'Живёт только в памяти: после перезапуска Obsidian его спросят снова.',
  'unlock.submit': 'Разблокировать',
  'unlock.later': 'Позже',
  'unlock.error.empty': 'Введите пароль.',

  'notice.unlocked': 'Подключение «{label}» синхронизируется.',
  'notice.unlockFailed': 'Подключение не стартовало: {reason}',
  'notice.locked': 'Подключения ждут пароль: без него ключи не выведены.',
  'notice.allUnlocked': 'Все подключения уже разблокированы.',
  'notice.copiesCleared': 'Конфликтных копий убрано: {count}.',
  'notice.noCopies': 'Конфликтных копий не найдено.',
  'notice.connected': 'Пространство подключено.',
} as const;
