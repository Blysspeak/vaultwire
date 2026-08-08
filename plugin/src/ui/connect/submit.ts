import type { RequestFn } from '../../api/http';
import { t } from '../../i18n/ru';
import type { RingLog } from '../../log';
import type { ConnectionSettings } from '../../settings/types';
import type { VaultReader } from '../../sync/types';
import { activateInvite, buildConnectionSettings, checkPassword } from './join';
import type { ActivatedInvite } from './join';
import { computeConnectionPlan } from './plan';
import type { WizardState } from './state';
import { summarizePlan } from './summary';
import type { PlanSummary } from './summary';

export interface SubmitDeps {
  readonly request: RequestFn;
  readonly deviceLabel: string;
  readonly reader: VaultReader;
  readonly maxFileBytes: () => number;
  readonly log: RingLog;
  /** Уже активированный инвайт: повторный ввод пароля не тратит попытку. */
  readonly joined: ActivatedInvite | null;
}

export interface SubmitOk {
  readonly ok: true;
  readonly joined: ActivatedInvite;
  readonly settings: ConnectionSettings;
  readonly summary: PlanSummary;
  readonly skipped: number;
}

export interface SubmitFailed {
  readonly ok: false;
  /** Активированный инвайт возвращается и при неудаче: повтор его не тратит. */
  readonly joined: ActivatedInvite | null;
  readonly error: string;
}

export type SubmitResult = SubmitOk | SubmitFailed;

/**
 * Последний шаг мастера: активация инвайта, сверка верификатора пароля и
 * построение плана. Ни одной записи ни на диск, ни в настройки: подключение
 * появляется только после подтверждения на экране предпросмотра.
 */
export async function submitPassword(state: WizardState, deps: SubmitDeps): Promise<SubmitResult> {
  const payload = state.payload;
  if (payload === null) return { ok: false, joined: deps.joined, error: t('connect.code.error.empty') };
  if (state.password.length === 0) {
    return { ok: false, joined: deps.joined, error: t('connect.password.error.empty') };
  }

  let joined = deps.joined;
  try {
    if (joined === null) {
      const activated = await activateInvite(payload, deps.deviceLabel, deps.request);
      if (!activated.ok) {
        return { ok: false, joined: null, error: t(`connect.password.error.${activated.failure}`) };
      }
      joined = activated.joined;
    }

    const keys = await checkPassword(joined.device, payload, state.password);
    if (keys === null) {
      // Неверный пароль: подключение не создаётся вовсе (разделы 2 и 9).
      deps.log.warn('ui', 'верификатор пароля не сошёлся', { space: payload.s });
      return { ok: false, joined, error: t('connect.password.error.mismatch') };
    }

    const plan = await computeConnectionPlan({
      client: joined.client,
      spaceId: payload.s,
      keys,
      role: joined.device.role,
      folder: state.folder,
      files: deps.reader.list(),
      maxFileBytes: deps.maxFileBytes(),
    });
    const settings = buildConnectionSettings({
      payload,
      device: joined.device,
      folder: state.folder,
      label: state.label,
      deviceLabel: deps.deviceLabel,
    });
    return {
      ok: true,
      joined,
      settings,
      summary: summarizePlan(plan.ops),
      skipped: plan.skipped.length,
    };
  } catch (error) {
    deps.log.error('ui', 'мастер подключения не построил план', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, joined, error: t('connect.password.error.plan') };
  }
}
