import { pino } from 'pino';
import { config } from '#config';

// Единственный вывод сервера. Прямой console запрещён правилами проекта.
export const logger = pino({
  level: config.logLevel,
  // Человекочитаемый формат только в терминале; под pm2 и в CI идёт JSON.
  transport: process.stdout.isTTY
    ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
  // Секреты не должны попадать в журнал ни при каком уровне.
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'token',
      'deviceToken',
      'ownerToken',
      'invite',
      // именно inviteCode: поле code занято кодом ошибки протокола
      'inviteCode',
    ],
    censor: '[скрыто]',
  },
});

export type Logger = typeof logger;
