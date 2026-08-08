import { expect } from 'vitest';
import { decide } from '../decide';
import type { DecideInput } from '../decide';
import type { SyncOp } from '../ops';
import { delta, docIdFor } from './fakes';

/** Общая обвязка тестов таблицы решений: пустой вход плюс нужные поля. */
export function run(input: Partial<DecideInput>): SyncOp[] {
  return decide({
    index: [],
    local: delta(),
    remote: [],
    role: 'rw',
    docIdFor,
    ...input,
  });
}

export function single(input: Partial<DecideInput>): SyncOp {
  const ops = run(input);
  expect(ops).toHaveLength(1);
  const op = ops[0];
  if (op === undefined) throw new Error('нет операции');
  return op;
}
