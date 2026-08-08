import { t } from '../i18n/ru';

/**
 * Относительное время человеку. Момент «сейчас» приходит параметром: функция
 * чистая, её видно в тестах и её нельзя случайно сделать зависимой от часов.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Формы русского счётного числительного: 1 минуту, 2 минуты, 5 минут. */
type PluralForm = 'one' | 'few' | 'many';

export function pluralForm(count: number): PluralForm {
  const abs = Math.abs(count);
  const tail = abs % 10;
  const hundred = abs % 100;
  if (hundred >= 11 && hundred <= 14) return 'many';
  if (tail === 1) return 'one';
  if (tail >= 2 && tail <= 4) return 'few';
  return 'many';
}

/**
 * Часы будущего быть не должно: рассинхрон часов между устройствами не повод
 * показывать «через минуту», такой момент считается только что случившимся.
 */
export function formatRelativeTime(at: number, now: number): string {
  const elapsed = now - at;
  if (elapsed < MINUTE_MS) return t('time.now');
  if (elapsed < HOUR_MS) {
    const count = Math.floor(elapsed / MINUTE_MS);
    return t(`time.minutes.${pluralForm(count)}`, { count });
  }
  if (elapsed < DAY_MS) {
    const count = Math.floor(elapsed / HOUR_MS);
    return t(`time.hours.${pluralForm(count)}`, { count });
  }
  if (elapsed < 2 * DAY_MS) return t('time.yesterday');
  return new Date(at).toLocaleDateString();
}
