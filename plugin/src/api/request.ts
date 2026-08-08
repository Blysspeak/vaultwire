import { requestUrl } from 'obsidian';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type { RequestFn } from './http';

/**
 * Единственная точка выхода в сеть. requestUrl не подчиняется CORS и одинаково
 * работает на десктопе и на мобильных; fetch и axios в плагине не используются.
 * throw отключён: статусы разбирает HttpClient в типизированные ошибки.
 */
export const obsidianRequest: RequestFn = (param: RequestUrlParam): Promise<RequestUrlResponse> =>
  requestUrl({ ...param, throw: false });
