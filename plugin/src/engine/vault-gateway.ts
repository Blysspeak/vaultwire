import { TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';
import type { VaultFileRef, VaultGateway, WriteOptions } from './apply';

/**
 * Единственное место, где применение встречается с Obsidian. Записи идут через
 * API Vault, удаление — через fileManager.trashFile, чтобы файл ушёл в корзину,
 * настроенную пользователем, а не исчез навсегда.
 */
export class ObsidianVaultGateway implements VaultGateway {
  constructor(private readonly app: App) {}

  getFile(path: string): VaultFileRef | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  folderExists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(path) instanceof TFolder;
  }

  async createFolder(path: string): Promise<void> {
    await this.app.vault.createFolder(path);
  }

  async create(path: string, data: string, options: WriteOptions): Promise<void> {
    await this.app.vault.create(path, data, options);
  }

  async modify(file: VaultFileRef, data: string, options: WriteOptions): Promise<void> {
    await this.app.vault.modify(this.resolve(file), data, options);
  }

  async createBinary(path: string, data: ArrayBuffer, options: WriteOptions): Promise<void> {
    await this.app.vault.createBinary(path, data, options);
  }

  async modifyBinary(file: VaultFileRef, data: ArrayBuffer, options: WriteOptions): Promise<void> {
    await this.app.vault.modifyBinary(this.resolve(file), data, options);
  }

  async trash(file: VaultFileRef): Promise<void> {
    await this.app.fileManager.trashFile(this.resolve(file));
  }

  /** Ссылка могла устареть между планированием и применением. */
  private resolve(file: VaultFileRef): TFile {
    const found = this.app.vault.getAbstractFileByPath(file.path);
    if (!(found instanceof TFile)) {
      throw new Error(`vaultwire: файл исчез до применения: ${file.path}`);
    }
    return found;
  }
}
