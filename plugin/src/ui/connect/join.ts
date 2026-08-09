import type { ConnectionCodePayload, JoinSpaceResponse } from '@vaultwire/shared';
import { createClient } from '../../api/client';
import type { VaultwireClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { RequestFn } from '../../api/http';
import { checkVerifier, deriveBundle, fromBase64 } from '../../crypto';
import type { KeyBundle } from '../../crypto';
import { createDefaultConnection } from '../../settings/defaults';
import type { ConnectionSettings } from '../../settings/types';

/** Почему активация инвайта не удалась: сервер не принял код или не доехал запрос. */
export const JOIN_FAILURES = ['invite', 'network'] as const;
export type JoinFailure = (typeof JOIN_FAILURES)[number];

export interface ActivatedInvite {
  readonly client: VaultwireClient;
  readonly device: JoinSpaceResponse;
}

export type ActivateResult =
  | { readonly ok: true; readonly joined: ActivatedInvite }
  | { readonly ok: false; readonly failure: JoinFailure };

/**
 * Активация инвайта: единственный момент выдачи токена устройства, а значит и
 * единственный источник соли с верификатором. Мастер вызывает её один раз и
 * держит результат: повторный ввод пароля не должен тратить попытку инвайта.
 */
export async function activateInvite(
  payload: ConnectionCodePayload,
  deviceLabel: string,
  request: RequestFn,
): Promise<ActivateResult> {
  // Сама активация идёт без токена: он и выдаётся этим запросом.
  const anonymous = createClient({ baseUrl: payload.u, token: '', request });
  try {
    const device = await anonymous.joinSpace(payload.s, { invite: payload.i, label: deviceLabel });
    // Дальше мастер строит план и обязан ходить уже с выданным токеном: клиент
    // без него получит 401 на первом же запросе после успешной активации.
    const client = createClient({ baseUrl: payload.u, token: device.deviceToken, request });
    return { ok: true, joined: { client, device } };
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
}

/**
 * Проверка пароля прямо в мастере (раздел 2): не сошёлся верификатор — ключи
 * забываются, подключение не создаётся, на диск не уходит ничего.
 */
export async function checkPassword(
  device: JoinSpaceResponse,
  payload: ConnectionCodePayload,
  password: string,
): Promise<KeyBundle | null> {
  const keys = await deriveBundle(password, fromBase64(device.salt), device.epoch);
  const matches = await checkVerifier(keys.metaKey, payload.s, device.verifier);
  return matches ? keys : null;
}

export interface ConnectionDraft {
  readonly payload: ConnectionCodePayload;
  readonly device: JoinSpaceResponse;
  readonly folder: string;
  /** Название подключения в интерфейсе. */
  readonly label: string;
  /** Метка этого устройства, та же, под которой активирован инвайт. */
  readonly deviceLabel: string;
  /** Переключатель мастера: хранить пароль в настройках плагина. */
  readonly rememberPassword: boolean;
}

/** Настройки подключения, готовые к сохранению после подтверждения плана. */
export function buildConnectionSettings(draft: ConnectionDraft): ConnectionSettings {
  const connection = createDefaultConnection({
    spaceId: draft.payload.s,
    serverUrl: draft.payload.u,
    deviceId: draft.device.deviceId,
    deviceToken: draft.device.deviceToken,
    label: draft.label,
    deviceLabel: draft.deviceLabel,
    localFolder: draft.folder,
    role: draft.device.role,
    keyEpoch: draft.device.epoch,
  });
  // Сам пароль сюда не кладётся: он сохраняется только после успешного старта.
  connection.rememberPassword = draft.rememberPassword;
  return connection;
}

/** Повторяемая ошибка — это транспорт; всё прочее означает негодный инвайт. */
function failureOf(error: unknown): JoinFailure {
  return error instanceof ApiError && error.retryable ? 'network' : 'invite';
}
