import { t } from '../../i18n/ru';
import { parseConnectionCode, serverHost } from './code';
import { validateFolderChoice } from './folder-rules';
import type { ExistingConnection } from './folder-rules';
import type { WizardState } from './state';

/** Шаг назад. Ничего не проверяется: введённое остаётся в состоянии мастера. */
export function stepBack(state: WizardState): void {
  state.error = null;
  state.step = state.step === 'password' ? 'folder' : 'code';
}

/**
 * Шаг вперёд с проверкой текущего шага. Не прошло — шаг не меняется, причина
 * остаётся в state.error уже строкой из словаря.
 */
export function stepForward(state: WizardState, existing: readonly ExistingConnection[]): void {
  state.error = null;
  if (state.step === 'code' && checkCode(state)) state.step = 'folder';
  else if (state.step === 'folder' && checkFolder(state, existing)) state.step = 'password';
}

function checkCode(state: WizardState): boolean {
  const parsed = parseConnectionCode(state.code);
  if (!parsed.ok) {
    state.error = t(`connect.code.error.${parsed.error}`);
    return false;
  }
  state.payload = parsed.payload;
  state.codeError = null;
  // Название подключения по умолчанию — хост сервера; человек может его заменить.
  if (state.label === '') state.label = serverHost(parsed.payload.u);
  return true;
}

function checkFolder(state: WizardState, existing: readonly ExistingConnection[]): boolean {
  const payload = state.payload;
  if (payload === null) return false;
  const issue = validateFolderChoice({ folder: state.folder, spaceId: payload.s, existing });
  state.folderIssue = issue;
  if (issue === null) return true;
  state.error = t(`connect.folder.error.${issue}`);
  return false;
}
