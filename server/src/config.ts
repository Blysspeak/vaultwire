import { z } from 'zod';

// Единственная точка чтения окружения. Всё остальное берёт готовый config.
// .env читаем штатным загрузчиком Node, без зависимостей: нет файла — не ошибка.
try {
  process.loadEnvFile();
} catch {
  // окружение задано снаружи (pm2, systemd, CI)
}

const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'обязателен'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  BLOB_DIR: z.string().min(1).default('./data/blobs'),
  // Пусто или не задан — создание пространств отключено.
  BOOTSTRAP_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? null : value)),
  LOG_LEVEL: logLevelSchema.default('info'),
  MAX_BLOB_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  DEFAULT_QUOTA_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024 * 1024),
  // Период сборки мусора. Ноль отключает её совсем: удобно для второго инстанса и тестов.
  GC_INTERVAL_MS: z.coerce.number().int().min(0).default(60 * 60 * 1000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(корень)'}: ${issue.message}`)
    .join('; ');
  // Логгер зависит от конфигурации, поэтому падаем обычной ошибкой до его создания.
  throw new Error(`Некорректная конфигурация окружения: ${details}`);
}

const env = parsed.data;

export type LogLevel = z.infer<typeof logLevelSchema>;

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  host: env.HOST,
  blobDir: env.BLOB_DIR,
  bootstrapToken: env.BOOTSTRAP_TOKEN,
  logLevel: env.LOG_LEVEL,
  maxBlobBytes: env.MAX_BLOB_BYTES,
  defaultQuotaBytes: env.DEFAULT_QUOTA_BYTES,
  gcIntervalMs: env.GC_INTERVAL_MS,
} as const;

export type Config = typeof config;
