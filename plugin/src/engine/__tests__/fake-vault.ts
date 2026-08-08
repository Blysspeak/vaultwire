import type { VaultFileRef, VaultGateway, WriteOptions } from '../apply';
import type { StateAdapter } from '../state-file';

/** Поддельный vault.adapter: файлы живут в памяти, порядок вызовов фиксируется. */
export class FakeAdapter implements StateAdapter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();
  readonly writes: string[] = [];
  readonly renames: Array<[string, string]> = [];

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) throw new Error(`нет файла ${path}`);
    return data;
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
    this.writes.push(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    const data = this.files.get(from);
    if (data === undefined) throw new Error(`нет файла ${from}`);
    this.files.delete(from);
    this.files.set(to, data);
    this.renames.push([from, to]);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }
}

export interface GatewayEvent {
  readonly kind: 'create' | 'modify' | 'createBinary' | 'modifyBinary' | 'createFolder' | 'trash';
  readonly path: string;
}

/** Поддельное хранилище: удаление возможно только через trash, как и в настоящем. */
export class FakeGateway implements VaultGateway {
  readonly files = new Map<string, string | ArrayBuffer>();
  readonly stats = new Map<string, WriteOptions>();
  readonly folders = new Set<string>();
  readonly events: GatewayEvent[] = [];
  failOn: string | null = null;

  getFile(path: string): VaultFileRef | null {
    return this.files.has(path) ? { path } : null;
  }

  folderExists(path: string): boolean {
    return this.folders.has(path);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
    this.events.push({ kind: 'createFolder', path });
  }

  async create(path: string, data: string, options: WriteOptions): Promise<void> {
    this.store('create', path, data, options);
  }

  async modify(file: VaultFileRef, data: string, options: WriteOptions): Promise<void> {
    this.store('modify', file.path, data, options);
  }

  async createBinary(path: string, data: ArrayBuffer, options: WriteOptions): Promise<void> {
    this.store('createBinary', path, data, options);
  }

  async modifyBinary(file: VaultFileRef, data: ArrayBuffer, options: WriteOptions): Promise<void> {
    this.store('modifyBinary', file.path, data, options);
  }

  async trash(file: VaultFileRef): Promise<void> {
    this.files.delete(file.path);
    this.events.push({ kind: 'trash', path: file.path });
  }

  private store(
    kind: GatewayEvent['kind'],
    path: string,
    data: string | ArrayBuffer,
    options: WriteOptions,
  ): void {
    if (this.failOn === path) throw new Error(`запись запрещена: ${path}`);
    this.files.set(path, data);
    this.stats.set(path, options);
    this.events.push({ kind, path });
  }
}
