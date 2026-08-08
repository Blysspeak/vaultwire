import { describe, expect, it } from 'vitest';
import { RevisionMismatchError, ServerError } from '../../api/errors';
import { SyncQueue, resolveConcurrency } from '../queue';
import type { QueueTask } from '../queue';

const noSleep = { sleep: async (): Promise<void> => undefined, random: (): number => 1 };

function task(id: string, run: () => Promise<void>): QueueTask {
  return { id, path: `${id}.md`, run };
}

describe('очередь прогона', () => {
  it('конкурентность: 4 на десктопе, 2 на мобильных', () => {
    expect(resolveConcurrency(false)).toBe(4);
    expect(resolveConcurrency(true)).toBe(2);
  });

  it('не запускает больше задач, чем разрешено', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, i) =>
      task(`t${i}`, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
      }),
    );
    const report = await new SyncQueue({ concurrency: 2 }).run(tasks);
    expect(peak).toBeLessThanOrEqual(2);
    expect(report.done).toHaveLength(10);
  });

  it('повторяет сбои сервера и доводит документ до конца', async () => {
    let attempts = 0;
    const queue = new SyncQueue({ concurrency: 1, retry: noSleep });
    const report = await queue.run([
      task('a', async () => {
        attempts += 1;
        if (attempts < 3) throw new ServerError({ status: 502 });
      }),
    ]);
    expect(attempts).toBe(3);
    expect(report.problems).toEqual([]);
    expect(queue.problems()).toEqual([]);
  });

  it('после пяти попыток документ уходит в список проблемных', async () => {
    let attempts = 0;
    const queue = new SyncQueue({ concurrency: 1, retry: noSleep });
    const report = await queue.run([
      task('a', async () => {
        attempts += 1;
        throw new ServerError({ status: 500, message: 'сервер лёг' });
      }),
    ]);
    expect(attempts).toBe(5);
    expect(report.problems).toEqual([
      { id: 'a', path: 'a.md', message: 'сервер лёг', attempts: 5 },
    ]);
    expect(queue.problems()).toHaveLength(1);
  });

  it('рассинхрон ревизии не повторяется слепо', async () => {
    let attempts = 0;
    const queue = new SyncQueue({ concurrency: 1, retry: noSleep });
    await queue.run([
      task('a', async () => {
        attempts += 1;
        throw new RevisionMismatchError({ status: 409 });
      }),
    ]);
    expect(attempts).toBe(1);
    expect(queue.problems()).toHaveLength(1);
  });

  it('удачный повтор проблемного документа очищает список', async () => {
    const queue = new SyncQueue({ concurrency: 1, retry: noSleep });
    await queue.run([task('a', () => Promise.reject(new Error('нет ключа')))]);
    expect(queue.problems()).toHaveLength(1);
    await queue.retryProblems((problem) => task(problem.id, async () => undefined));
    expect(queue.problems()).toEqual([]);
  });

  it('одна упавшая задача не мешает остальным', async () => {
    const queue = new SyncQueue({ concurrency: 4, retry: noSleep });
    const report = await queue.run([
      task('ok1', async () => undefined),
      task('bad', () => Promise.reject(new Error('битый шифротекст'))),
      task('ok2', async () => undefined),
    ]);
    expect([...report.done].sort()).toEqual(['ok1', 'ok2']);
    expect(report.problems.map((p) => p.id)).toEqual(['bad']);
  });
});
