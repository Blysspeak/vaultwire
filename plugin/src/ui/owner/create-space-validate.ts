import { isFolderConflict } from '../../engine/guards';
import { t } from '../../i18n/ru';
import type { MessageKey } from '../../i18n/ru';
import type { ConnectionSettings } from '../../settings/types';
import type { BootstrapFailure } from '../../sync';
import { isSaneFolder } from '../connect/folder-rules';
import type { CreateSpaceInput } from './create-space-run';

/** Причина, по которой подключение не стартовало, человеческим языком. */
const FAILURE_KEYS: Record<BootstrapFailure, MessageKey> = {
  password: 'bootstrap.password',
  epoch: 'bootstrap.epoch',
  space: 'bootstrap.space',
  transport: 'bootstrap.transport',
};

export function failureKey(failure: BootstrapFailure): MessageKey {
  return FAILURE_KEYS[failure];
}

/** Имя подключения по умолчанию: имя папки-источника, для корня — общее слово. */
export function connectionLabel(folder: string): string {
  const name = folder.slice(folder.lastIndexOf('/') + 1);
  return name === '' ? t('createSpace.defaultLabel') : name;
}

/**
 * Проверки перед первым запросом к серверу. Возвращает ключ сообщения или null.
 * Пароль сверяется дважды: опечатка делает пространство нечитаемым навсегда,
 * а верификатор сойдётся, потому что его считает тот же неверный пароль.
 */
export function validateCreateSpace(
  input: CreateSpaceInput,
  repeat: string,
  existing: readonly ConnectionSettings[],
): MessageKey | null {
  if (!isHttpUrl(input.serverUrl)) return 'error.serverUrl';
  if (input.bootstrapToken.length === 0) return 'error.tokenRequired';
  if (input.password.length === 0) return 'error.passwordRequired';
  if (input.password !== repeat) return 'error.passwordMismatch';
  if (input.deviceLabel.length === 0) return 'error.deviceLabelRequired';
  if (!isSaneFolder(input.localFolder)) return 'connect.folder.error.invalid';
  if (isFolderConflict(existing.map((connection) => connection.localFolder), input.localFolder)) {
    // Пересечение папок означало бы один файл в двух пространствах.
    return 'connect.folder.error.nested';
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
