import { describe, expect, it } from 'vitest';
import { formatRelativeTime, pluralForm } from '../relative-time';

const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('pluralForm', () => {
  it('различает формы по последней цифре', () => {
    expect(pluralForm(1)).toBe('one');
    expect(pluralForm(2)).toBe('few');
    expect(pluralForm(4)).toBe('few');
    expect(pluralForm(5)).toBe('many');
    expect(pluralForm(0)).toBe('many');
    expect(pluralForm(21)).toBe('one');
    expect(pluralForm(22)).toBe('few');
    expect(pluralForm(25)).toBe('many');
  });

  it('второй десяток всегда many', () => {
    expect(pluralForm(11)).toBe('many');
    expect(pluralForm(12)).toBe('many');
    expect(pluralForm(14)).toBe('many');
    expect(pluralForm(111)).toBe('many');
  });
});

describe('formatRelativeTime', () => {
  it('меньше минуты — только что', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('только что');
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('только что');
  });

  it('момент из будущего не превращается в отрицательные минуты', () => {
    expect(formatRelativeTime(NOW + 5 * MINUTE, NOW)).toBe('только что');
  });

  it('минуты с правильным окончанием', () => {
    expect(formatRelativeTime(NOW - MINUTE, NOW)).toBe('1 минуту назад');
    expect(formatRelativeTime(NOW - 2 * MINUTE, NOW)).toBe('2 минуты назад');
    expect(formatRelativeTime(NOW - 5 * MINUTE, NOW)).toBe('5 минут назад');
    expect(formatRelativeTime(NOW - 11 * MINUTE, NOW)).toBe('11 минут назад');
    expect(formatRelativeTime(NOW - 21 * MINUTE, NOW)).toBe('21 минуту назад');
    expect(formatRelativeTime(NOW - 59 * MINUTE, NOW)).toBe('59 минут назад');
  });

  it('часы с правильным окончанием', () => {
    expect(formatRelativeTime(NOW - HOUR, NOW)).toBe('1 час назад');
    expect(formatRelativeTime(NOW - 2 * HOUR, NOW)).toBe('2 часа назад');
    expect(formatRelativeTime(NOW - 5 * HOUR, NOW)).toBe('5 часов назад');
    expect(formatRelativeTime(NOW - 23 * HOUR, NOW)).toBe('23 часа назад');
  });

  it('вчера — сутки и до двух', () => {
    expect(formatRelativeTime(NOW - DAY, NOW)).toBe('вчера');
    expect(formatRelativeTime(NOW - 2 * DAY + MINUTE, NOW)).toBe('вчера');
  });

  it('старше двух суток — дата', () => {
    const at = NOW - 10 * DAY;
    expect(formatRelativeTime(at, NOW)).toBe(new Date(at).toLocaleDateString());
  });
});
