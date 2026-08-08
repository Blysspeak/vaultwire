import { ConnectionIndex } from '../state';
import type { FakeAdapter } from './fake-vault';
import { TEST_SPACE } from './fakes';

export const CONFIG_DIR = '.obsidian';
export const STATE_PATH = `${CONFIG_DIR}/plugins/vaultwire/state-${TEST_SPACE}.json`;

/** Ручной таймер вместо setTimeout: дебаунс проверяется без ожидания. */
export function manualTimer(): {
  index: (adapter: FakeAdapter) => ConnectionIndex;
  fire: () => void;
} {
  const pending: Array<() => void> = [];
  return {
    index: (adapter) =>
      new ConnectionIndex(adapter, {
        configDir: CONFIG_DIR,
        spaceId: TEST_SPACE,
        schedule: (run) => {
          pending.push(run);
          return pending.length;
        },
        cancel: () => undefined,
      }),
    fire: () => {
      const run = pending.shift();
      if (run !== undefined) run();
    },
  };
}
