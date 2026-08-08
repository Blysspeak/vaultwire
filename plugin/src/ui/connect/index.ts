/** Публичный API мастера подключения. Раздел 8 спецификации. */

export { CODE_ERRORS, buildConnectionCode, parseConnectionCode, serverHost } from './code';
export type { CodeError, CodeParseResult } from './code';

export { FOLDER_ISSUES, isSaneFolder, validateFolderChoice } from './folder-rules';
export type { ExistingConnection, FolderChoice, FolderIssue } from './folder-rules';

export { FolderPicker } from './folder-picker';
export type { FolderSuggestion } from './folder-picker';

export { PLAN_ENTRY_KINDS, PREVIEW_PATH_LIMIT, formatBytes, summarizePlan } from './summary';
export type { PlanEntry, PlanEntryKind, PlanSummary } from './summary';

export { computeConnectionPlan } from './plan';
export type { ConnectionPlan, PlanRequest } from './plan';

export { JOIN_FAILURES, activateInvite, buildConnectionSettings, checkPassword } from './join';
export type { ActivateResult, ActivatedInvite, ConnectionDraft, JoinFailure } from './join';

export { PlanPreviewModal } from './preview';
export type { PlanPreviewDeps } from './preview';

export { BULK_PATH_LIMIT, BulkDeleteModal } from './confirm-bulk';
export type { BulkConfirmDeps } from './confirm-bulk';

export { ConnectWizard, openConnectWizard } from './wizard';
export type { ConnectWizardDeps } from './wizard';
