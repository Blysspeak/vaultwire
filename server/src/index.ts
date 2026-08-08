import { buildApp } from '#app';
import { config } from '#config';
import { disconnectDb } from '#db';
import { logger } from '#logger';
import { startGc } from '#services/gc';

const app = await buildApp();
const stopGc = startGc();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'останов сервера');
  try {
    stopGc();
    await app.close();
    await disconnectDb();
  } catch (error) {
    logger.error({ err: error }, 'сбой при остановке');
    process.exitCode = 1;
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  logger.fatal({ err: error }, 'не удалось поднять сервер');
  stopGc();
  await disconnectDb();
  process.exit(1);
}
