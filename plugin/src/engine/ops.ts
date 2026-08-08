import type { DocId, Rev } from '@vaultwire/shared';
import type { LocalFile, RemoteChange } from './types';

/**
 * Причина решения. Одиннадцать строк таблицы раздела 6 плюс исходы, которых в
 * таблице нет: переезд, обоюдное удаление и запрет роли только для чтения.
 */
export const DECISION_REASONS = [
  'both-unchanged',
  'local-modified',
  'remote-modified',
  'both-modified',
  'local-deleted',
  'remote-deleted',
  'local-deleted-remote-modified',
  'local-modified-remote-deleted',
  'local-created',
  'remote-created',
  'both-created',
  'both-deleted',
  'renamed',
  'read-only',
] as const;
export type DecisionReason = (typeof DECISION_REASONS)[number];

export const SYNC_OP_KINDS = [
  'noop',
  'push',
  'pull',
  'pushDelete',
  'pullDelete',
  'conflict',
  'move',
] as const;
export type SyncOpKind = (typeof SYNC_OP_KINDS)[number];

interface OpBase {
  readonly path: string;
  readonly docId: DocId;
  readonly reason: DecisionReason;
}

/** Отправить локальную версию. expectedRev null — создание (If-None-Match). */
export interface PushOp extends OpBase {
  readonly kind: 'push';
  readonly local: LocalFile;
  readonly expectedRev: Rev | null;
}

export interface PullOp extends OpBase {
  readonly kind: 'pull';
  readonly remote: RemoteChange;
}

export interface PushDeleteOp extends OpBase {
  readonly kind: 'pushDelete';
  readonly expectedRev: Rev;
}

export interface PullDeleteOp extends OpBase {
  readonly kind: 'pullDelete';
  readonly remote: RemoteChange;
}

/** Серверная версия ложится в основной путь, локальная уходит в конфликтную копию. */
export interface ConflictOp extends OpBase {
  readonly kind: 'conflict';
  readonly local: LocalFile | null;
  readonly remote: RemoteChange;
}

/** Переезд одним запросом POST /moves: пара удаления и создания дала бы окно гонки. */
export interface MoveOp extends OpBase {
  readonly kind: 'move';
  readonly fromPath: string;
  readonly fromDocId: DocId;
  readonly fromRev: Rev;
  readonly local: LocalFile;
}

export interface NoopOp extends OpBase {
  readonly kind: 'noop';
}

export type SyncOp = PushOp | PullOp | PushDeleteOp | PullDeleteOp | ConflictOp | MoveOp | NoopOp;

/** Операции, которые удаляют файл: их считает порог массовых операций. */
export function isDestructive(op: SyncOp): op is PullDeleteOp | PushDeleteOp {
  return op.kind === 'pullDelete' || op.kind === 'pushDelete';
}
