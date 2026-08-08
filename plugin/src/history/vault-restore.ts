import type { App } from 'obsidian';
import type { VaultGateway } from '../engine/apply';
import { writeFile } from '../engine/apply';
import type { RestoreVault } from './types';

/**
 * Восстановление пишет обычной записью хранилища: недостающие папки создаются,
 * времена берутся из ревизии. Подавление эха здесь не нужно — восстановление
 * это осознанная локальная правка, и она обязана уехать на сервер.
 */
export class GatewayRestoreVault implements RestoreVault {
  constructor(
    private readonly gateway: VaultGateway,
    private readonly reader: (path: string) => Promise<ArrayBuffer | null>,
  ) {}

  read(path: string): Promise<ArrayBuffer | null> {
    return this.reader(path);
  }

  async write(path: string, data: ArrayBuffer, mtime: number, ctime: number): Promise<void> {
    await writeFile(this.gateway, { path, data, mtime, ctime });
  }
}

/** Чтение тела файла хранилища; null — файла нет. */
export function readBinaryFromVault(app: App): (path: string) => Promise<ArrayBuffer | null> {
  return async (path: string): Promise<ArrayBuffer | null> => {
    const file = app.vault.getFileByPath(path);
    return file === null ? null : app.vault.readBinary(file);
  };
}
