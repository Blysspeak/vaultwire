import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#db';
import { integrationDatabaseUrl } from './env';

/** Живое приложение поверх тестовой базы и временного каталога тел. */
export type Harness = {
  app: FastifyInstance;
  prisma: Db;
  blobDir: string;
  /** Проход сборки мусора по одному пространству, шаги и порядок как в runGc. */
  collectGarbage: (spaceId: string, now?: Date) => Promise<void>;
  /** Пространство под уборку после набора. Зовётся фикстурой. */
  track: (spaceId: string) => void;
  stop: () => Promise<void>;
};

/** Путь файла тела на диске: раскладка blobStore, шардинг по двум символам хеша. */
export function blobPath(harness: Harness, spaceId: string, hash: string): string {
  return join(harness.blobDir, spaceId, hash.slice(0, 2), hash);
}

/**
 * Файлы набора идут параллельно, у каждого свой пул соединений. Без потолка
 * Prisma берёт по числу ядер на каждый и упирается в max_connections базы.
 */
function withPoolLimit(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '10');
  }
  return parsed.toString();
}

/**
 * Стенд на набор: поднимается перед тестами, после набора чистит свои пространства.
 * Возвращает доступ, а не сам стенд: до beforeAll его ещё нет.
 */
export function useHarness(): () => Harness {
  let harness: Harness | null = null;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    if (harness !== null) await harness.stop();
  });

  return () => {
    if (harness === null) throw new Error('стенд не поднят');
    return harness;
  };
}

export async function startHarness(): Promise<Harness> {
  if (integrationDatabaseUrl === null) {
    throw new Error('startHarness вызван без TEST_DATABASE_URL');
  }

  const blobDir = await mkdtemp(join(tmpdir(), 'vaultwire-it-'));
  process.env.DATABASE_URL = withPoolLimit(integrationDatabaseUrl);
  process.env.BLOB_DIR = blobDir;
  // Проходы сборки мусора зовутся руками, фоновый таймер тестам только мешает.
  process.env.GC_INTERVAL_MS = '0';

  // Импорты динамические: окружение читается на первом импорте #config,
  // а статический импорт поднялся бы выше присваиваний выше.
  const { buildApp } = await import('#app');
  const { prisma, disconnectDb } = await import('#db');
  const { sweepBlobs } = await import('#services/gc-blobs');
  const { retentionCutoff } = await import('#services/gc-plan');
  const { pruneRevisions } = await import('#services/gc-revisions');
  const { recomputeUsedBytes } = await import('#services/quota');

  const app = await buildApp();
  await app.ready();

  const spaceIds: string[] = [];

  return {
    app,
    prisma,
    blobDir,

    // Штатный runGc обходит все пространства базы. Файлы набора идут параллельно,
    // и такой проход чистил бы чужое пространство прямо посреди соседнего теста.
    collectGarbage: async (spaceId: string, now: Date = new Date()) => {
      const space = await prisma.space.findUniqueOrThrow({
        where: { id: spaceId },
        select: { retentionDays: true, maxRevisions: true },
      });
      await pruneRevisions(spaceId, space.maxRevisions, retentionCutoff(now, space.retentionDays));
      const swept = await sweepBlobs(spaceId, now);
      if (swept.removed > 0) await recomputeUsedBytes(spaceId);
    },

    track: (spaceId: string) => {
      spaceIds.push(spaceId);
    },
    stop: async () => {
      // Каскад по Space уносит устройства, инвайты, документы, ревизии и строки тел.
      await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
      await app.close();
      await disconnectDb();
      await rm(blobDir, { recursive: true, force: true });
    },
  };
}
