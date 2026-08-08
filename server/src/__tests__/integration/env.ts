import { describe } from 'vitest';

/**
 * Интеграционному набору нужна живая PostgreSQL, её строка приходит в TEST_DATABASE_URL.
 * Переменной нет — набор пропускается целиком: docker отсюда никто не поднимает,
 * и прогон на машине без базы обязан оставаться зелёным.
 */
const raw = process.env.TEST_DATABASE_URL ?? '';

export const integrationDatabaseUrl: string | null = raw.length > 0 ? raw : null;

const SKIP_NOTE = 'пропущено: не задана TEST_DATABASE_URL, набору нужна живая PostgreSQL';

/**
 * Обёртка над describe с внятной причиной пропуска в имени набора.
 * Тело набора обязано только объявлять хуки и тесты: у пропущенного набора
 * vitest всё равно выполняет тело, но не запускает ни один хук.
 */
export function describeIntegration(name: string, body: () => void): void {
  if (integrationDatabaseUrl === null) {
    describe.skip(`${name} — ${SKIP_NOTE}`, body);
    return;
  }
  describe(name, body);
}
