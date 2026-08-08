import { describe, expect, it } from 'vitest';
import type { FileSyncStatus } from '../../sync/file-status';
import { badgeText } from '../note-badge-text';

const NOW = Date.UTC(2026, 7, 9, 12, 0, 0);

function status(over: Partial<FileSyncStatus>): FileSyncStatus {
  return { kind: 'synced', at: NOW, author: null, ...over };
}

describe('подпись у заголовка заметки', () => {
  it('несохранённая правка обещает отправку, а не время', () => {
    expect(badgeText(status({ kind: 'pending' }), NOW)).toBe('vaultwire: ждёт отправки');
  });

  it('свежая синхронизация читается как «только что»', () => {
    expect(badgeText(status({ at: NOW - 5_000 }), NOW)).toBe('vaultwire: синхронизирован только что');
  });

  it('минуты склоняются по-русски', () => {
    expect(badgeText(status({ at: NOW - 5 * 60_000 }), NOW)).toBe(
      'vaultwire: синхронизирован 5 минут назад',
    );
  });

  it('чужая правка называет автора', () => {
    const text = badgeText(
      status({ kind: 'received', author: 'ПК Влада', at: NOW - 2 * 60_000 }),
      NOW,
    );
    expect(text).toBe('vaultwire: правка от ПК Влада, 2 минуты назад');
  });

  it('входящая правка без автора не выдумывает его', () => {
    const text = badgeText(status({ kind: 'received', author: null, at: NOW - 60_000 }), NOW);
    expect(text).toBe('vaultwire: синхронизирован 1 минуту назад');
  });

  it('без отметки времени показывает «только что», а не пустоту', () => {
    expect(badgeText(status({ at: null }), NOW)).toBe('vaultwire: синхронизирован только что');
  });
});
