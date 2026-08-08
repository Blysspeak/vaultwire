import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from '#config';
import { ProtocolError } from '#protocol-error';

/**
 * Слой хранения шифротел. Прячет файловую систему за интерфейсом,
 * чтобы позже подставить S3 без правок роутов и сервисов.
 */
export interface BlobStore {
  has(spaceId: string, hash: string): Promise<boolean>;
  /** Пишет во временный файл и переименовывает: наполовину записанного тела не бывает. */
  put(spaceId: string, hash: string, data: Buffer): Promise<void>;
  read(spaceId: string, hash: string): Promise<Buffer | null>;
  remove(spaceId: string, hash: string): Promise<void>;
}

/** SHA-256 принятого тела: сервер считает сам и не верит заголовку. */
export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// Оба значения попадают в путь на диске, поэтому алфавит проверяется жёстко.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_HASH = /^[0-9a-f]{64}$/;

function segments(spaceId: string, hash: string): [string, string, string] {
  if (!SAFE_ID.test(spaceId)) {
    throw new ProtocolError('bad_request', 'недопустимый идентификатор пространства');
  }
  if (!SAFE_HASH.test(hash)) {
    throw new ProtocolError('invalid_blob_hash', 'недопустимый хеш тела');
  }
  // Шардинг по двум символам: без него в каталоге пространства окажутся сотни тысяч файлов.
  return [spaceId, hash.slice(0, 2), hash];
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

export function createFileBlobStore(rootDir: string): BlobStore {
  const root = resolve(rootDir);

  const pathOf = (spaceId: string, hash: string): string => join(root, ...segments(spaceId, hash));

  return {
    async has(spaceId, hash) {
      try {
        const info = await stat(pathOf(spaceId, hash));
        return info.isFile();
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },

    async put(spaceId, hash, data) {
      const target = pathOf(spaceId, hash);
      const dir = dirname(target);
      await mkdir(dir, { recursive: true });
      // Временный файл лежит рядом с целевым: rename внутри одного тома атомарен.
      const temp = join(dir, `${hash}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, data, { flag: 'wx' });
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },

    async read(spaceId, hash) {
      try {
        return await readFile(pathOf(spaceId, hash));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async remove(spaceId, hash) {
      await rm(pathOf(spaceId, hash), { force: true });
    },
  };
}

/** Хранилище приложения. Каталог берётся из BLOB_DIR. */
export const blobStore: BlobStore = createFileBlobStore(config.blobDir);
