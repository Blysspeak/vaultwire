import type { FastifyPluginAsync } from 'fastify';
import { BLOB_HASH_HEADER, blobParamsSchema, uploadBlobHeadersSchema } from '@vaultwire/shared';
import { config } from '#config';
import { ProtocolError } from '#protocol-error';
import { parseOrFail } from '#routes/validate';
import { actorOf } from '#services/actor';
import { readBlob, storeBlob } from '#services/blob-service';

const OCTET_STREAM = 'application/octet-stream';

/**
 * POST /spaces/:id/blobs (сырое тело, заголовок X-Blob-Sha256) и
 * GET /spaces/:id/blobs/:hash. Сервер пересчитывает SHA-256 сам и сверяет с заголовком.
 * Пути без /v1: префикс задан при регистрации в app.ts.
 */
export const blobsRoutes: FastifyPluginAsync = async (app) => {
  // Разбор сырого тела включён только в этой области видимости, JSON-роутов он не касается.
  app.addContentTypeParser(OCTET_STREAM, { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(
    '/spaces/:id/blobs',
    { preHandler: app.requireRole('rw'), bodyLimit: config.maxBlobBytes },
    async (request, reply) => {
      const headers = parseOrFail(uploadBlobHeadersSchema, request.headers, 'заголовок с хешем тела');
      const body = request.body;
      if (!Buffer.isBuffer(body)) {
        throw new ProtocolError('bad_request', `ожидается сырое тело ${OCTET_STREAM}`);
      }

      const stored = await storeBlob(actorOf(request).spaceId, headers[BLOB_HASH_HEADER], body);
      // 201 на новое тело, 200 если такое уже лежит: клиент так узнаёт про дедупликацию.
      return reply.status(stored.created ? 201 : 200).send({ hash: stored.hash, size: stored.size });
    },
  );

  app.get('/spaces/:id/blobs/:hash', { preHandler: app.requireRole('ro') }, async (request, reply) => {
    const { hash } = parseOrFail(blobParamsSchema, request.params, 'путь тела');
    const data = await readBlob(actorOf(request).spaceId, hash);
    return reply
      .header('content-type', OCTET_STREAM)
      .header('content-length', data.byteLength)
      // Адресация по содержимому: тело под этим хешем никогда не изменится.
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(data);
  });
};
