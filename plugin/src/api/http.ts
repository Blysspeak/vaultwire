import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { InvalidResponseError } from './errors';
import { errorFromResponse, errorFromThrown } from './http-errors';
import { withRetry } from './retry';
import type { RetryOptions } from './retry';

/** Единственный способ выйти в сеть: requestUrl из Obsidian, никакого fetch. */
export type RequestFn = (param: RequestUrlParam) => Promise<RequestUrlResponse>;

/** Схема Zod из shared, взятая структурно: сам zod плагину напрямую не нужен. */
export interface ResponseSchema<T> {
  parse(value: unknown): T;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  /** Тело в JSON. Взаимоисключимо с binary. */
  readonly json?: unknown;
  /** Сырое шифротело для загрузки блоба. */
  readonly binary?: ArrayBuffer;
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Переопределение токена: bootstrap при создании пространства,
   * пустая строка при активации инвайта, когда токена ещё нет.
   */
  readonly token?: string;
}

export interface HttpClientOptions {
  /** Базовый URL сервера, завершающие слэши срезаются. */
  readonly baseUrl: string;
  readonly token: string;
  readonly request: RequestFn;
  readonly retry?: Partial<RetryOptions>;
}

export interface HttpResult<T> {
  readonly status: number;
  readonly data: T;
}

/** Тонкая обёртка над requestUrl: базовый URL, авторизация, разбор тела, повторы. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly request: RequestFn;
  private readonly retry: Partial<RetryOptions>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.request = options.request;
    this.retry = options.retry ?? {};
  }

  /** Ответ в JSON, проверенный схемой протокола. */
  async json<T>(request: HttpRequest, schema: ResponseSchema<T>): Promise<T> {
    const result = await this.jsonWithStatus(request, schema);
    return result.data;
  }

  /** То же плюс статус: загрузка блоба отвечает 201 на новое тело и 200 на уже известное. */
  async jsonWithStatus<T>(request: HttpRequest, schema: ResponseSchema<T>): Promise<HttpResult<T>> {
    const response = await this.send(request);
    return { status: response.status, data: validate(response.text, schema) };
  }

  /** Сырое тело: скачивание блоба. */
  async binary(request: HttpRequest): Promise<ArrayBuffer> {
    const response = await this.send(request);
    return response.arrayBuffer;
  }

  private send(request: HttpRequest): Promise<RequestUrlResponse> {
    return withRetry(() => this.once(request), this.retry);
  }

  private async once(request: HttpRequest): Promise<RequestUrlResponse> {
    let response: RequestUrlResponse;
    try {
      response = await this.request(this.toParam(request));
    } catch (cause) {
      throw errorFromThrown(cause);
    }
    if (response.status >= 400) {
      throw errorFromResponse(response.status, response.headers, response.text);
    }
    return response;
  }

  private toParam(request: HttpRequest): RequestUrlParam {
    const token = request.token ?? this.token;
    const headers: Record<string, string> = { ...request.headers };
    if (token.length > 0) headers['authorization'] = `Bearer ${token}`;
    const param: RequestUrlParam = {
      url: this.baseUrl + request.path + queryString(request.query),
      method: request.method,
      headers,
      // Статусы разбираем сами: свой класс ошибки на каждый код таблицы раздела 3.
      throw: false,
    };
    if (request.binary !== undefined) {
      return { ...param, body: request.binary, contentType: 'application/octet-stream' };
    }
    if (request.json !== undefined) {
      return { ...param, body: JSON.stringify(request.json), contentType: 'application/json' };
    }
    return param;
  }
}

function queryString(query: HttpRequest['query']): string {
  if (query === undefined) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function validate<T>(body: string, schema: ResponseSchema<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new InvalidResponseError({ message: 'Тело ответа не разобралось как JSON' });
  }
  try {
    return schema.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidResponseError({ details: { detail } });
  }
}
