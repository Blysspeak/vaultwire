import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { ScanFile } from '../engine/scanner';
import type { VaultReader } from './types';

/** Чтение хранилища через API Obsidian. Тела читаются двоично: шифруется всё одинаково. */
export class ObsidianVaultReader implements VaultReader {
  constructor(private readonly app: App) {}

  list(): readonly ScanFile[] {
    return this.app.vault.getFiles();
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`vaultwire: файл исчез до чтения: ${path}`);
    }
    return this.app.vault.readBinary(file);
  }
}
