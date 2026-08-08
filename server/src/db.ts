import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { config } from '#config';
import { logger } from '#logger';

function createPrismaClient() {
  const client = new PrismaClient({
    datasourceUrl: config.databaseUrl,
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // Prisma по умолчанию пишет в stdout мимо pino, поэтому события перехватываем.
  client.$on('warn', (event: Prisma.LogEvent) => {
    logger.warn({ target: event.target }, event.message);
  });
  client.$on('error', (event: Prisma.LogEvent) => {
    logger.error({ target: event.target }, event.message);
  });

  return client;
}

export type Db = ReturnType<typeof createPrismaClient>;

// tsx watch перезагружает модули: без ссылки в globalThis каждая перезагрузка
// оставляла бы висеть пул соединений.
const globalRef = globalThis as typeof globalThis & { vaultwirePrisma?: Db };

export const prisma: Db = globalRef.vaultwirePrisma ?? createPrismaClient();
globalRef.vaultwirePrisma = prisma;

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  delete globalRef.vaultwirePrisma;
}
