import type { EchoGuard } from './echo';

/** Ссылка на существующий файл хранилища. Больше применению ничего не нужно. */
export interface VaultFileRef {
  readonly path: string;
}

/** mtime и ctime берутся из метаданных документа, а не из момента записи. */
export interface WriteOptions {
  readonly mtime: number;
  readonly ctime: number;
}

/**
 * Запись идёт только через API Vault, удаление — только через fileManager.trashFile:
 * vault.delete уносит файл мимо корзины и мимо настройки пользователя.
 */
export interface VaultGateway {
  getFile(path: string): VaultFileRef | null;
  folderExists(path: string): boolean;
  createFolder(path: string): Promise<void>;
  create(path: string, data: string, options: WriteOptions): Promise<void>;
  modify(file: VaultFileRef, data: string, options: WriteOptions): Promise<void>;
  createBinary(path: string, data: ArrayBuffer, options: WriteOptions): Promise<void>;
  modifyBinary(file: VaultFileRef, data: ArrayBuffer, options: WriteOptions): Promise<void>;
  trash(file: VaultFileRef): Promise<void>;
}

export interface WriteRequest extends WriteOptions {
  readonly path: string;
  readonly data: string | ArrayBuffer;
}

/** План одного прогона. Порядок внутри плана задаёт applyPlan, не вызывающий. */
export interface ApplyPlan {
  readonly writes: readonly WriteRequest[];
  readonly trashes: readonly string[];
}

export interface ApplyFailure {
  readonly path: string;
  readonly message: string;
}

export interface ApplyReport {
  readonly written: readonly string[];
  readonly trashed: readonly string[];
  readonly missing: readonly string[];
  readonly failed: readonly ApplyFailure[];
}

export interface ApplyOptions {
  /** Подавление эха: путь помечается на время записи. */
  readonly echo?: EchoGuard;
}

/**
 * Сначала создания и обновления, затем удаления. Порядок обязателен: при переезде
 * файл сначала появляется по новому пути и только потом исчезает по старому,
 * иначе окно между операциями выглядит как потеря файла.
 */
export async function applyPlan(
  gateway: VaultGateway,
  plan: ApplyPlan,
  options: ApplyOptions = {},
): Promise<ApplyReport> {
  const written: string[] = [];
  const trashed: string[] = [];
  const missing: string[] = [];
  const failed: ApplyFailure[] = [];

  for (const request of plan.writes) {
    try {
      await writeFile(gateway, request, options.echo);
      written.push(request.path);
    } catch (error) {
      failed.push({ path: request.path, message: describe(error) });
    }
  }

  for (const path of plan.trashes) {
    const file = gateway.getFile(path);
    if (file === null) {
      missing.push(path);
      continue;
    }
    try {
      await gateway.trash(file);
      trashed.push(path);
    } catch (error) {
      failed.push({ path, message: describe(error) });
    }
  }

  return { written, trashed, missing, failed };
}

/** Создаёт недостающие папки и пишет файл нужным методом Vault. */
export async function writeFile(
  gateway: VaultGateway,
  request: WriteRequest,
  echo?: EchoGuard,
): Promise<void> {
  const write = async (): Promise<void> => {
    await ensureFolder(gateway, parentFolder(request.path));
    const file = gateway.getFile(request.path);
    const options: WriteOptions = { mtime: request.mtime, ctime: request.ctime };
    if (typeof request.data === 'string') {
      if (file === null) await gateway.create(request.path, request.data, options);
      else await gateway.modify(file, request.data, options);
    } else if (file === null) {
      await gateway.createBinary(request.path, request.data, options);
    } else {
      await gateway.modifyBinary(file, request.data, options);
    }
  };
  await (echo === undefined ? write() : echo.wrap(request.path, write));
}

/** Папки создаются сверху вниз: createFolder не делает промежуточные уровни. */
export async function ensureFolder(gateway: VaultGateway, folder: string): Promise<void> {
  if (folder === '') return;
  const segments = folder.split('/');
  let current = '';
  for (const segment of segments) {
    current = current === '' ? segment : `${current}/${segment}`;
    if (!gateway.folderExists(current)) await gateway.createFolder(current);
  }
}

function parentFolder(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
