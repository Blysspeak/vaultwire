import { describe, expect, it } from 'vitest';
import type { RequestUrlParam } from 'obsidian';
import { BLOB_HASH_HEADER } from '@vaultwire/shared';
import { computeDocId } from '../../crypto';
import { testKeys } from './doubles';
import type { Reply } from './harness';
import { harness } from './harness';

const FOLDER = 'Команда';

/**
 * Сервер тот же, что и в pushHandler из pass-fixtures.ts, но считает вызовы
 * батча и умеет проваливать один конкретный docId — этого нет в общей фикстуре,
 * а именно это здесь и проверяется.
 */
function batchServer(options: { failDocId?: string } = {}): {
  handler: (param: RequestUrlParam) => Reply | null;
  batchCalls: () => number;
} {
  let batchCalls = 0;
  return {
    batchCalls: () => batchCalls,
    handler: (param) => {
      if (param.url.includes('/changes')) return { status: 200, body: JSON.stringify({ seq: 0, items: [] }) };
      if (param.url.endsWith('/blobs')) {
        const headers = param.headers ?? {};
        return { status: 201, body: JSON.stringify({ hash: headers[BLOB_HASH_HEADER] ?? '', size: 10 }) };
      }
      if (param.url.endsWith(':batch')) {
        batchCalls += 1;
        const items = (JSON.parse(String(param.body)) as { items: Array<{ docId: string }> }).items;
        const results = items.map((item, i) =>
          item.docId === options.failDocId
            ? { docId: item.docId, error: { code: 'quota_exceeded', message: 'место кончилось' } }
            : { docId: item.docId, rev: 1, seq: i + 1 },
        );
        return { status: 200, body: JSON.stringify(results) };
      }
      return null;
    },
  };
}

describe('батч-заливка создания и обновления', () => {
  it('дробит большой прогон на пачки по 50 документов', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    const total = 120;
    for (let i = 0; i < total; i += 1) {
      h.reader.put(`${FOLDER}/файл-${String(i).padStart(3, '0')}.md`, `содержимое ${i}`);
    }
    const server = batchServer();
    h.handler = server.handler;

    const report = await h.runner.run();

    expect(report.pushed).toHaveLength(total);
    // 120 документов при лимите 50 на батч это три запроса, а не 120 отдельных PUT.
    expect(server.batchCalls()).toBe(3);
  });

  it('отказ по одному документу не роняет остальные элементы пачки', async () => {
    const h = harness();
    const keys = await testKeys();
    h.connection.setKeys(keys);
    h.reader.put(`${FOLDER}/ок.md`, 'этот дойдёт');
    h.reader.put(`${FOLDER}/переполнено.md`, 'а этот нет');
    const failDocId = await computeDocId(keys.pathKey, 'переполнено.md');
    h.handler = batchServer({ failDocId }).handler;

    const report = await h.runner.run();

    expect(report.pushed).toEqual(['ок.md']);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.path).toBe('переполнено.md');
    expect(report.problems[0]?.message).toContain('место кончилось');
  });
});
