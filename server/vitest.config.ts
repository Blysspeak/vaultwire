import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Конфигурация окружения читается на импорте любого модуля, а живая база тестам не нужна.
    env: {
      DATABASE_URL: 'postgresql://vaultwire:test@127.0.0.1:5432/vaultwire_unit',
      // Ожидаемые предупреждения не должны шуметь в выводе прогона.
      LOG_LEVEL: 'fatal',
    },
  },
});
