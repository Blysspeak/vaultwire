import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { SpaceId } from '@vaultwire/shared';
import type { VaultwireClient } from '../../api/client';
import { t } from '../../i18n/ru';
import type { RingLog } from '../../log';
import { ConfirmModal } from '../confirm';
import { errorText } from '../format';

export interface DeleteSpaceDeps {
  readonly app: App;
  readonly client: VaultwireClient;
  readonly spaceId: SpaceId;
  readonly log: RingLog;
  /** Обновление списка участников после сноса. */
  done(): Promise<void>;
}

/**
 * Снос пространства на сервере. Действие необратимое и бьёт по всей команде,
 * поэтому подтверждается набором слова. Слово короткое и осмысленное: набирать
 * ulid ради подтверждения человек не станет, он скопирует его мимо смысла.
 */
export function confirmDeleteSpace(deps: DeleteSpaceDeps): void {
  new ConfirmModal(
    deps.app,
    {
      title: t('deleteSpace.title'),
      body: t('deleteSpace.body'),
      confirmText: t('deleteSpace.action'),
      requiredText: t('deleteSpace.word'),
      prompt: t('deleteSpace.prompt'),
    },
    () => {
      void runDelete(deps);
    },
  ).open();
}

async function runDelete(deps: DeleteSpaceDeps): Promise<void> {
  try {
    await deps.client.deleteSpace(deps.spaceId);
    new Notice(t('notice.spaceDeleted'));
    await deps.done();
  } catch (error) {
    deps.log.error('members', 'удаление пространства не прошло', { reason: errorText(error) });
    new Notice(t('notice.spaceDeleteFailed'));
  }
}
