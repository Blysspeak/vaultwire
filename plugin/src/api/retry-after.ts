/**
 * Retry-After: либо секунды, либо HTTP-дата.
 * Возвращает миллисекунды ожидания, null — заголовка нет или он негоден.
 */
export function parseRetryAfter(value: string | null | undefined, nowMs = Date.now()): number | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (raw.length === 0) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - nowMs);
}
