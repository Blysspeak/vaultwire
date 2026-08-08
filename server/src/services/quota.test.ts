import { describe, expect, it } from 'vitest';
import { ProtocolError } from '#protocol-error';
import { assertBlobSize, assertWithinQuota, fitsQuota, type QuotaState } from '#services/quota';

function state(usedBytes: number, quotaBytes: number): QuotaState {
  return { usedBytes: BigInt(usedBytes), quotaBytes: BigInt(quotaBytes) };
}

describe('fitsQuota', () => {
  it('впритык к пределу разрешает заливку', () => {
    expect(fitsQuota(state(90, 100), 10)).toBe(true);
  });

  it('превышение хотя бы на байт запрещает', () => {
    expect(fitsQuota(state(90, 100), 11)).toBe(false);
  });

  it('считает в bigint: за пределом точности number разница в байт не теряется', () => {
    // 9007199254740993 не представим числом: в number он схлопывается в 9007199254740992.
    const huge: QuotaState = { usedBytes: 9_007_199_254_740_992n, quotaBytes: 9_007_199_254_740_993n };
    expect(fitsQuota(huge, 1)).toBe(true);
    expect(fitsQuota(huge, 2)).toBe(false);
  });
});

describe('assertWithinQuota', () => {
  it('молчит, пока место есть', () => {
    expect(() => {
      assertWithinQuota(state(0, 100), 100);
    }).not.toThrow();
  });

  it('отдаёт quota_exceeded с текущими числами', () => {
    try {
      assertWithinQuota(state(90, 100), 20);
      expect.unreachable('ожидалась ошибка квоты');
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      const failure = error as ProtocolError;
      expect(failure.code).toBe('quota_exceeded');
      expect(failure.status).toBe(507);
      expect(failure.details).toEqual({ quotaBytes: 100, usedBytes: 90 });
    }
  });
});

describe('assertBlobSize', () => {
  it('пустое тело это ошибка запроса, а не превышение', () => {
    expect(() => {
      assertBlobSize(0, 100);
    }).toThrowError(expect.objectContaining({ code: 'bad_request' }));
  });

  it('тело ровно по пределу проходит', () => {
    expect(() => {
      assertBlobSize(100, 100);
    }).not.toThrow();
  });

  it('тело сверх предела отдаёт too_large с самим пределом', () => {
    expect(() => {
      assertBlobSize(101, 100);
    }).toThrowError(expect.objectContaining({ code: 'too_large', details: { maxBlobBytes: 100 } }));
  });
});
