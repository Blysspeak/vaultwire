import { describe, expect, it } from 'vitest';
import type { RequestUrlParam } from 'obsidian';
import { BLOB_HASH_HEADER } from '@vaultwire/shared';
import {
  computeDocId,
  encryptBuffer,
  encryptMeta,
  sha256Hex,
  toArrayBuffer,
  utf8Encode,
} from '../../crypto';
import type { KeyBundle } from '../../crypto';
import { isConflictCopy } from '../../conflicts/naming';
import { testKeys } from './doubles';
import type { Handler, Reply } from './harness';
import { harness } from './harness';

const PATH = 'Заметка.md';
const VAULT_PATH = `Команда/${PATH}`;

/** Серверная версия документа: тело блобом, метаданные шифром. */
async function remoteDoc(keys: KeyBundle, text: string, rev: number, seq: number) {
  const plain = toArrayBuffer(utf8Encode(text));
  const cipher = await encryptBuffer(keys.contentKey, plain);
  const item = {
    docId: await computeDocId(keys.pathKey, PATH),
    rev,
    seq,
    deleted: false,
    metaCipher: await encryptMeta(keys.metaKey, {
      path: PATH,
      mtime: 3000,
      ctime: 500,
      size: plain.byteLength,
      plainSha256: await sha256Hex(plain),
      deviceLabel: 'сервер',
      op: 'update',
    }),
    blobHash: await sha256Hex(cipher),
    size: plain.byteLength,
  };
  return { item, cipher, changes: JSON.stringify({ seq, items: [item] }) };
}

/** Ответы сервера на приём: список изменений и тело блоба. */
function pullHandler(changes: string, cipher: ArrayBuffer): Handler {
  return (param: RequestUrlParam): Reply | null => {
    if (param.url.includes('/changes')) return { status: 200, body: changes };
    if (param.url.includes('/blobs/')) return { status: 200, body: '', binary: cipher };
    return null;
  };
}

/** Ответы сервера на отправку: приём блоба и запись документа. */
function pushHandler(): Handler {
  return (param: RequestUrlParam): Reply | null => {
    if (param.url.includes('/changes')) {
      return { status: 200, body: JSON.stringify({ seq: 0, items: [] }) };
    }
    if (param.url.endsWith('/blobs')) {
      const headers = param.headers ?? {};
      return {
        status: 201,
        body: JSON.stringify({ hash: headers[BLOB_HASH_HEADER] ?? '', size: 10 }),
      };
    }
    if (param.method === 'PUT') return { status: 200, body: JSON.stringify({ rev: 1, seq: 3 }) };
    return null;
  };
}

describe('прогон целиком', () => {
  it('серверное изменение доезжает до файла и до индекса', async () => {
    const h = harness();
    const keys = await testKeys();
    h.connection.setKeys(keys);
    const remote = await remoteDoc(keys, 'привет', 1, 5);
    h.handler = pullHandler(remote.changes, remote.cipher);

    const report = await h.runner.run();

    expect(report.pulled).toEqual([VAULT_PATH]);
    expect(h.gateway.files.get(VAULT_PATH)).toBe('привет');
    expect(h.connection.index.get(PATH)?.rev).toBe(1);
    expect(h.connection.lastSeq).toBe(5);
  });

  it('новый локальный файл уходит на сервер и попадает в индекс', async () => {
    const h = harness();
    h.connection.setKeys(await testKeys());
    h.reader.put(VAULT_PATH, 'мой текст');
    h.handler = pushHandler();

    const report = await h.runner.run();

    expect(report.pushed).toEqual([PATH]);
    expect(h.connection.index.get(PATH)?.rev).toBe(1);
    expect(h.calls.some((call) => call.startsWith('PUT '))).toBe(true);
  });

  it('одновременная правка даёт конфликтную копию рядом', async () => {
    const h = harness();
    const keys = await testKeys();
    h.connection.setKeys(keys);
    const docId = await computeDocId(keys.pathKey, PATH);
    h.connection.index.set({
      path: PATH,
      docId,
      rev: 1,
      plainHash: 'старый',
      mtime: 1000,
      size: 5,
      syncedAt: 1000,
      dirty: false,
    });
    h.reader.put(VAULT_PATH, 'моя правка', 2000);
    const remote = await remoteDoc(keys, 'чужая правка', 2, 9);
    h.handler = pullHandler(remote.changes, remote.cipher);

    const report = await h.runner.run();

    // Серверная версия занимает основной путь, локальная ложится копией рядом.
    expect(h.gateway.files.get(VAULT_PATH)).toBe('чужая правка');
    expect(report.conflicts).toHaveLength(1);
    const copyPath = report.conflicts[0] ?? '';
    expect(isConflictCopy(copyPath)).toBe(true);
    expect(h.gateway.files.get(copyPath)).toBe('моя правка');
    expect(h.connection.index.get(PATH)?.rev).toBe(2);
  });

  it('порог массового удаления останавливает прогон до применения', async () => {
    const h = harness();
    const keys = await testKeys();
    h.connection.setKeys(keys);
    // Двадцать одна запись индекса без файлов на диске: диск отвалился, а не опустел.
    for (let i = 0; i < 21; i += 1) {
      h.connection.index.set({
        path: `Файл-${i}.md`,
        docId: await computeDocId(keys.pathKey, `Файл-${i}.md`),
        rev: 1,
        plainHash: `hash-${i}`,
        mtime: 1000,
        size: 5,
        syncedAt: 1000,
        dirty: false,
      });
    }

    const report = await h.runner.run();

    expect(report.massCheck?.confirmationRequired).toBe(true);
    expect(report.massCheck?.deletions).toBe(21);
    expect(h.calls.some((call) => call.startsWith('DELETE '))).toBe(false);

    // Подтверждение действует ровно на один прогон.
    h.connection.allowMassOnce();
    h.handler = (param: RequestUrlParam): Reply | null =>
      param.method === 'DELETE' ? { status: 200, body: JSON.stringify({ rev: 2, seq: 4 }) } : null;
    const second = await h.runner.run();
    expect(second.massCheck).toBeNull();
    expect(second.trashed).toHaveLength(21);
  });
});
