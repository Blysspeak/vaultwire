import { checkVerifier, deriveBundle, fromBase64 } from '../crypto';
import type { RingLog } from '../log';
import type { SyncConnection } from './connection';

/** Причины, по которым подключение не стартовало. */
export const BOOTSTRAP_FAILURES = ['password', 'epoch', 'space', 'transport'] as const;
export type BootstrapFailure = (typeof BOOTSTRAP_FAILURES)[number];

export interface BootstrapResult {
  readonly ok: boolean;
  readonly failure: BootstrapFailure | null;
}

const OK: BootstrapResult = { ok: true, failure: null };

/**
 * Стартовая последовательность раздела 6. Отличие от порядка в тексте одно:
 * соль и верификатор лежат на сервере, поэтому GET /spaces идёт до вывода
 * ключей. Смысл сохранён — до сверки верификатора не пишется ничего.
 */
export async function bootstrapConnection(
  connection: SyncConnection,
  password: string,
  log: RingLog,
): Promise<BootstrapResult> {
  try {
    await connection.index.load();
    const space = await connection.client.getSpace(connection.spaceId);
    connection.setRole(space.role);
    if (space.verifier === null) {
      return stop(connection, log, 'space', 'у пространства нет верификатора');
    }

    const keys = await deriveBundle(password, fromBase64(space.salt), space.epoch);
    if (!(await checkVerifier(keys.metaKey, connection.spaceId, space.verifier))) {
      // Неверный пароль: ни одной записи ни локально, ни на сервер.
      return stop(connection, log, 'password', 'верификатор пароля не сошёлся');
    }

    const epoch = checkEpoch(connection, space.epoch);
    if (epoch !== null) return stop(connection, log, 'epoch', epoch);

    connection.setKeys(keys);
    connection.setState(connection.writable ? 'idle' : 'readonly');
    log.info('sync', 'подключение готово', { space: connection.spaceId, role: space.role });
    return OK;
  } catch (error) {
    const state = connection.fail(error);
    log.error('sync', 'подключение не стартовало', { space: connection.spaceId, state });
    return { ok: false, failure: state === 'revoked' ? 'space' : 'transport' };
  }
}

/**
 * Ротация ключа в первой версии не реализована: расходящаяся эпоха означает,
 * что накопленный индекс зашифрован другим ключом. Пустой индекс — просто
 * догоняем сервер, писать поверх нечего.
 */
function checkEpoch(connection: SyncConnection, epoch: number): string | null {
  if (epoch === connection.settings.keyEpoch) return null;
  if (connection.index.all().length === 0) {
    connection.settings.keyEpoch = epoch;
    return null;
  }
  return `эпоха ключа разошлась: локально ${connection.settings.keyEpoch}, на сервере ${epoch}`;
}

function stop(
  connection: SyncConnection,
  log: RingLog,
  failure: BootstrapFailure,
  reason: string,
): BootstrapResult {
  connection.forgetKeys();
  connection.setState('error', reason);
  log.error('sync', 'подключение остановлено', { space: connection.spaceId, failure, reason });
  return { ok: false, failure };
}
