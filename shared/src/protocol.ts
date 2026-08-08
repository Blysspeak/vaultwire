import { z } from 'zod';

/** Версия протокола. Меняется при несовместимых изменениях контракта. */
export const PROTOCOL_VERSION = 1;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Идентификатор пространства, выдаётся сервером при создании. */
export const spaceIdSchema = z.string().min(1).max(64).brand<'SpaceId'>();
export type SpaceId = z.infer<typeof spaceIdSchema>;

/** Идентификатор устройства, выдаётся сервером при активации инвайта. */
export const deviceIdSchema = z.string().min(1).max(64).brand<'DeviceId'>();
export type DeviceId = z.infer<typeof deviceIdSchema>;

/**
 * base64url(HMAC-SHA256(pathKey, NFC(путь))) — 32 байта без паддинга, ровно 43 символа.
 * Считается клиентом, сервер только хранит.
 */
export const docIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'docId: base64url от 32 байт, 43 символа')
  .brand<'DocId'>();
export type DocId = z.infer<typeof docIdSchema>;

/** SHA-256 шифротела в нижнем регистре hex. */
export const blobHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'blobHash: sha256 в нижнем регистре hex')
  .brand<'BlobHash'>();
export type BlobHash = z.infer<typeof blobHashSchema>;

/** Числовые пределы протокола, общие для сервера и плагина. */
export const PROTOCOL_LIMITS = {
  /** Максимум документов в одном POST /docs:batch. */
  batchMaxDocs: 50,
  /** Порог тела, выше которого документ не идёт батчем, байты. */
  batchBodyMaxBytes: 256 * 1024,
  /** Верхняя и стандартная граница limit у GET /changes. */
  changesMaxLimit: 500,
  changesDefaultLimit: 200,
  /** Соль пространства, байты. */
  saltBytes: 32,
  /** IV каждого шифроблоба, байты, префиксом к шифротексту. */
  ivBytes: 12,
  /** Итераций PBKDF2-SHA256 при выводе master-ключа. */
  pbkdf2Iterations: 650_000,
} as const;
