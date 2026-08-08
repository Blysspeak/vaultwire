import type { ConnectionCodePayload } from '@vaultwire/shared';
import type { App } from 'obsidian';
import type { CodeError } from './code';
import type { ExistingConnection, FolderIssue } from './folder-rules';

/** Три шага мастера из раздела 8: код, папка, пароль. */
export const WIZARD_STEPS = ['code', 'folder', 'password'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Всё, что мастер держит между перерисовками. Пароль живёт только здесь. */
export interface WizardState {
  step: WizardStep;
  code: string;
  payload: ConnectionCodePayload | null;
  codeError: CodeError | null;
  folder: string;
  folderIssue: FolderIssue | null;
  label: string;
  password: string;
  /** Идёт активация инвайта или проверка пароля: кнопки заблокированы. */
  busy: boolean;
  /** Текст последней ошибки, уже взятый из словаря. */
  error: string | null;
}

/** То, что шаг знает о мастере. Переходы шагов остаются за самим мастером. */
export interface StepHost {
  readonly app: App;
  readonly state: WizardState;
  existing(): readonly ExistingConnection[];
  refresh(): void;
}

export function initialState(): WizardState {
  return {
    step: 'code',
    code: '',
    payload: null,
    codeError: null,
    folder: '',
    folderIssue: null,
    label: '',
    password: '',
    busy: false,
    error: null,
  };
}
