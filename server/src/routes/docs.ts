import type { FastifyPluginAsync } from 'fastify';
import {
  batchDocsRequestSchema,
  conditionalWriteHeadersSchema,
  docParamsSchema,
  moveDocRequestSchema,
  putDocRequestSchema,
  revSchema,
} from '@vaultwire/shared';
import { ProtocolError } from '#protocol-error';
import { parseOrFail } from '#routes/validate';
import { actorOf } from '#services/actor';
import { batchDocs, deleteDoc, moveDoc, putDoc } from '#services/doc-ops';
import { listRevisions } from '#services/doc-history';

// JSON здесь это метаданные и ссылки на тела; общий лимит приложения рассчитан на блобы.
const JSON_BODY_LIMIT = 128 * 1024;
// 50 документов по 64 КБ метаданных плюс накладные расходы.
const BATCH_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * If-Match с текущим rev означает обновление, If-None-Match со звёздочкой создание.
 * Безусловная запись запрещена: она молча затирала бы чужие правки.
 */
function expectedRevFrom(headers: unknown): number | null {
  const parsed = parseOrFail(conditionalWriteHeadersSchema, headers, 'заголовки условной записи');
  const ifMatch = parsed['if-match'];
  const ifNoneMatch = parsed['if-none-match'];

  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    throw new ProtocolError('bad_request', 'If-Match и If-None-Match вместе не имеют смысла');
  }
  if (ifNoneMatch === '*') return null;
  if (ifMatch === undefined) {
    throw new ProtocolError('bad_request', 'нужен If-Match с rev или If-None-Match: *');
  }

  // Клиенты оформляют значение как ETag, кавычки и признак слабого сравнения снимаем.
  const rev = revSchema.safeParse(Number(ifMatch.replace(/^W\//, '').replace(/"/g, '')));
  if (!rev.success) {
    throw new ProtocolError('bad_request', 'If-Match должен нести номер ревизии');
  }
  return rev.data;
}

/**
 * PUT и DELETE /spaces/:id/docs/:docId, POST /spaces/:id/docs:batch,
 * POST /spaces/:id/moves, GET /spaces/:id/docs/:docId/revisions.
 * Пути без /v1: префикс задан при регистрации в app.ts.
 */
export const docsRoutes: FastifyPluginAsync = async (app) => {
  const write = { preHandler: app.requireRole('rw'), bodyLimit: JSON_BODY_LIMIT };
  const read = { preHandler: app.requireRole('ro') };

  app.put('/spaces/:id/docs/:docId', write, async (request) => {
    const { docId } = parseOrFail(docParamsSchema, request.params, 'путь документа');
    const expectedRev = expectedRevFrom(request.headers);
    const body = parseOrFail(putDocRequestSchema, request.body, 'тело запроса');
    return putDoc(actorOf(request), docId, expectedRev, body);
  });

  app.delete('/spaces/:id/docs/:docId', write, async (request) => {
    const { docId } = parseOrFail(docParamsSchema, request.params, 'путь документа');
    const expectedRev = expectedRevFrom(request.headers);
    if (expectedRev === null) {
      throw new ProtocolError('bad_request', 'удаление требует If-Match с текущим rev');
    }
    return deleteDoc(actorOf(request), docId, expectedRev);
  });

  // Двойное двоеточие в шаблоне даёт литеральный путь /docs:batch, а не параметр.
  app.post('/spaces/:id/docs::batch', { ...write, bodyLimit: BATCH_BODY_LIMIT }, async (request) => {
    const { items } = parseOrFail(batchDocsRequestSchema, request.body, 'батч документов');
    return batchDocs(actorOf(request), items);
  });

  app.post('/spaces/:id/moves', write, async (request) => {
    const body = parseOrFail(moveDocRequestSchema, request.body, 'переезд документа');
    return moveDoc(actorOf(request), body);
  });

  app.get('/spaces/:id/docs/:docId/revisions', read, async (request) => {
    const { docId } = parseOrFail(docParamsSchema, request.params, 'путь документа');
    return listRevisions(actorOf(request).spaceId, docId);
  });
};
