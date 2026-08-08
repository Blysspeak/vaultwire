import { describe, expect, it } from 'vitest';
import { inviteActivationLimit } from '#plugins/limits';
import { normalizeError, ProtocolError } from '#protocol-error';

describe('ProtocolError', () => {
  it('берёт статус из таблицы кодов протокола', () => {
    expect(new ProtocolError('too_large', 'велико').status).toBe(413);
    expect(new ProtocolError('quota_exceeded', 'квота').status).toBe(507);
    expect(new ProtocolError('bad_request', 'тело').status).toBe(400);
    expect(new ProtocolError('internal', 'сбой').status).toBe(500);
  });

  it('details попадают в тело только когда они есть', () => {
    expect(new ProtocolError('not_found', 'нет').toBody()).toEqual({ code: 'not_found', message: 'нет' });
    expect(new ProtocolError('revision_mismatch', 'рассинхрон', { rev: 4 }).toBody()).toEqual({
      code: 'revision_mismatch',
      message: 'рассинхрон',
      details: { rev: 4 },
    });
  });
});

describe('normalizeError', () => {
  it('свою ошибку пропускает как есть', () => {
    const error = new ProtocolError('forbidden', 'роль не позволяет');
    expect(normalizeError(error)).toBe(error);
  });

  it('ошибку со статусом переводит в код протокола', () => {
    const error = Object.assign(new Error('тело велико'), { statusCode: 413 });
    expect(normalizeError(error).code).toBe('too_large');
  });

  it('неизвестную ошибку прячет за internal без утечки текста', () => {
    const normalized = normalizeError(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    expect(normalized.code).toBe('internal');
    expect(normalized.status).toBe(500);
    expect(normalized.message).not.toContain('5432');
  });

  it('ошибка схемы на исходящих данных это внутренний сбой, а не bad_request', () => {
    const zodLike = Object.assign(new Error('invalid'), {
      name: 'ZodError',
      issues: [{ path: ['spaceId'], message: 'ожидается строка' }],
    });
    expect(normalizeError(zodLike).code).toBe('internal');
  });
});

describe('rate limit', () => {
  // Плагин бросает то, что вернул билдер: тело вместо ошибки давало бы 500 вместо 429.
  it('билдер отдаёт ошибку, которую обработчик приложения узнаёт', () => {
    const built: unknown = inviteActivationLimit.errorResponseBuilder();
    expect(built).toBeInstanceOf(ProtocolError);
    const normalized = normalizeError(built);
    expect(normalized.status).toBe(429);
    expect(normalized.toBody().code).toBe('rate_limited');
  });
});
