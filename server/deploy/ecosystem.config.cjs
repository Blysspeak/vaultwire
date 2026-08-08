// Конфигурация pm2 для obsidian.boostix.space.
// Пути абсолютные: pm2 стартует из своей рабочей директории, относительные пути
// тут ломаются молча. Корень вычисляется от самого файла, поэтому чекаут можно
// положить куда угодно, а не только в предугаданный каталог.
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'vaultwire-server',
      namespace: 'production',
      // Build-шага нет: tsx транспилирует дерево TS на старте, как и на бэкенде boostix.
      script: 'src/index.ts',
      interpreter: `${ROOT}/node_modules/.bin/tsx`,
      cwd: ROOT,
      // Один процесс обязателен: реестр WebSocket-соединений живёт в памяти,
      // второй инстанс не разошлёт звоночки клиентам первого.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      // Тело блоба до MAX_BLOB_BYTES (50 МБ) Fastify держит в памяти целиком,
      // поэтому предел взят с запасом на несколько параллельных заливок.
      max_memory_restart: '700M',
      // Бесконечный цикл падений душит сервер: между попытками пауза.
      restart_delay: 5000,
      max_restarts: 10,
      // Переменные окружения берутся из .env рядом с cwd: config.ts читает его
      // через process.loadEnvFile(). Секреты в этот файл не попадают.
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: `${ROOT}/logs/error.log`,
      out_file: `${ROOT}/logs/out.log`,
      merge_logs: true,
    },
  ],
};
