import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Пакет obsidian поставляет только типы, рантайма у него нет. Без подмены любой
 * модуль, который импортирует его хотя бы через цепочку, в тестах не поднимается,
 * и приходится городить искусственные разрезы в коде ради тестируемости.
 */
export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./src/__mocks__/obsidian.ts', import.meta.url)),
    },
  },
});
