import type { RetryOptions } from '../api/retry';
import { withRetry } from '../api/retry';

/**
 * Очередь прогона с ограниченной конкурентностью. Приём и отправка держат
 * отдельные экземпляры: медленная закачка тела не должна тормозить отправку.
 */

/**
 * Раздел 6: 4 на десктопе, 2 на мобильных. Значение Platform.isMobile передаёт
 * вызывающий — обращение к obsidian отсюда сделало бы модуль непроверяемым.
 */
export const QUEUE_CONCURRENCY = { desktop: 4, mobile: 2 } as const;

export function resolveConcurrency(isMobile: boolean): number {
  return isMobile ? QUEUE_CONCURRENCY.mobile : QUEUE_CONCURRENCY.desktop;
}

export interface QueueTask {
  /** docId или путь: чем документ опознаётся в списке проблемных. */
  readonly id: string;
  readonly path: string;
  readonly run: () => Promise<void>;
}

export interface ProblemDoc {
  readonly id: string;
  readonly path: string;
  readonly message: string;
  /** Сколько попыток съедено, включая первую. */
  readonly attempts: number;
}

export interface QueueOptions {
  readonly concurrency: number;
  readonly retry?: Partial<RetryOptions>;
  readonly onDone?: (task: QueueTask) => void;
  readonly onProblem?: (problem: ProblemDoc) => void;
}

export interface QueueReport {
  readonly done: readonly string[];
  readonly problems: readonly ProblemDoc[];
}

export class SyncQueue {
  private readonly failed = new Map<string, ProblemDoc>();

  constructor(private readonly options: QueueOptions) {}

  /** Документы, исчерпавшие попытки. Повтор — по кнопке в панели. */
  problems(): ProblemDoc[] {
    return [...this.failed.values()];
  }

  clearProblems(): void {
    this.failed.clear();
  }

  async run(tasks: readonly QueueTask[]): Promise<QueueReport> {
    const done: string[] = [];
    const problems: ProblemDoc[] = [];
    let next = 0;
    const width = Math.max(1, Math.min(this.options.concurrency, tasks.length));

    const worker = async (): Promise<void> => {
      for (;;) {
        const task = tasks[next];
        next += 1;
        if (task === undefined) return;
        const problem = await this.execute(task);
        if (problem === null) {
          this.failed.delete(task.id);
          done.push(task.id);
          this.options.onDone?.(task);
        } else {
          this.failed.set(task.id, problem);
          problems.push(problem);
          this.options.onProblem?.(problem);
        }
      }
    };

    await Promise.all(Array.from({ length: width }, worker));
    return { done, problems };
  }

  /** Повтор проблемных: задачу пересобирает вызывающий, состояние могло устареть. */
  async retryProblems(rebuild: (problem: ProblemDoc) => QueueTask | null): Promise<QueueReport> {
    const tasks: QueueTask[] = [];
    for (const problem of this.problems()) {
      const task = rebuild(problem);
      if (task === null) this.failed.delete(problem.id);
      else tasks.push(task);
    }
    return this.run(tasks);
  }

  private async execute(task: QueueTask): Promise<ProblemDoc | null> {
    let attempts = 1;
    try {
      await withRetry(task.run, {
        ...this.options.retry,
        onRetry: (error, delayMs, attempt) => {
          attempts = attempt + 1;
          this.options.retry?.onRetry?.(error, delayMs, attempt);
        },
      });
      return null;
    } catch (error) {
      return { id: task.id, path: task.path, message: describe(error), attempts };
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
