/** Уровни журнала, от подробного к критическому. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Ёмкость кольца по разделу 9 спецификации. */
export const LOG_CAPACITY = 500;

export interface LogEntry {
  readonly at: number;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Кольцевой журнал в памяти. Вывод в консоль запрещён требованиями каталога,
 * поэтому записи только копятся и отдаются панели и экспорту диагностики.
 */
export class RingLog {
  private readonly buffer: Array<LogEntry | undefined>;
  private next = 0;
  private wrapped = false;
  private minLevel: LogLevel = 'info';

  constructor(private readonly capacity: number = LOG_CAPACITY) {
    this.buffer = new Array<LogEntry | undefined>(capacity);
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(scope: string, message: string, data?: Readonly<Record<string, unknown>>): void {
    this.push('debug', scope, message, data);
  }

  info(scope: string, message: string, data?: Readonly<Record<string, unknown>>): void {
    this.push('info', scope, message, data);
  }

  warn(scope: string, message: string, data?: Readonly<Record<string, unknown>>): void {
    this.push('warn', scope, message, data);
  }

  error(scope: string, message: string, data?: Readonly<Record<string, unknown>>): void {
    this.push('error', scope, message, data);
  }

  /** Записи в хронологическом порядке, от старой к свежей. */
  entries(): LogEntry[] {
    const ordered: LogEntry[] = [];
    const start = this.wrapped ? this.next : 0;
    const count = this.wrapped ? this.capacity : this.next;
    for (let i = 0; i < count; i += 1) {
      const entry = this.buffer[(start + i) % this.capacity];
      if (entry !== undefined) ordered.push(entry);
    }
    return ordered;
  }

  /** Плоский текст для экспорта диагностики. Содержимое заметок сюда не попадает. */
  format(): string {
    return this.entries().map(formatEntry).join('\n');
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.next = 0;
    this.wrapped = false;
  }

  private push(
    level: LogLevel,
    scope: string,
    message: string,
    data?: Readonly<Record<string, unknown>>,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    this.buffer[this.next] = { at: Date.now(), level, scope, message, ...(data ? { data } : {}) };
    this.next += 1;
    if (this.next >= this.capacity) {
      this.next = 0;
      this.wrapped = true;
    }
  }
}

function formatEntry(entry: LogEntry): string {
  const head = `${new Date(entry.at).toISOString()} ${entry.level.toUpperCase()} [${entry.scope}] ${entry.message}`;
  return entry.data ? `${head} ${JSON.stringify(entry.data)}` : head;
}
