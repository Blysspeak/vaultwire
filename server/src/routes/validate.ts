import { ProtocolError } from '#protocol-error';

/**
 * Разбор тел и параметров схемами из shared.
 *
 * Намеренно safeParse, а не parse: у пакета shared своя копия zod, поэтому
 * instanceof ZodError в общем обработчике ошибок не срабатывает и любая
 * невалидная схема отдавала бы 500 вместо 400.
 */
type ParseResult<T> = { success: true; data: T } | { success: false; error: unknown };
type Schema<T> = { safeParse: (value: unknown) => ParseResult<T> };

function issuesOf(error: unknown): Array<{ path: string; message: string }> {
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.map((raw: unknown) => {
    const issue = raw as { path?: unknown; message?: unknown };
    return {
      path: Array.isArray(issue.path) ? issue.path.join('.') : '',
      message: typeof issue.message === 'string' ? issue.message : 'некорректное значение',
    };
  });
}

export function parseOrFail<T>(schema: Schema<T>, value: unknown, subject: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProtocolError('bad_request', `некорректные данные: ${subject}`, {
    issues: issuesOf(result.error),
  });
}
