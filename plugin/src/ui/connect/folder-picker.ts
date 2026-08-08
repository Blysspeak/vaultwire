import { SuggestModal, type App } from 'obsidian';
import { normalizeRelPath } from '../../crypto';
import { t } from '../../i18n/ru';
import { isSaneFolder } from './folder-rules';

/** Существующая папка хранилища либо предложение создать новую по введённому пути. */
export interface FolderSuggestion {
  readonly path: string;
  readonly create: boolean;
}

/**
 * Выбор папки подключения. Папка не создаётся здесь: мастер лишь запоминает
 * путь, а создание идёт после подтверждения плана, вместе с первой записью.
 */
export class FolderPicker extends SuggestModal<FolderSuggestion> {
  constructor(
    app: App,
    private readonly onPick: (path: string) => void,
  ) {
    super(app);
    this.setPlaceholder(t('folder.pick.placeholder'));
  }

  override getSuggestions(query: string): FolderSuggestion[] {
    const needle = normalizeRelPath(query).toLowerCase();
    const existing = this.app.vault
      .getAllFolders(true)
      .map((folder) => normalizeRelPath(folder.path))
      .filter((path) => needle === '' || path.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b));
    const suggestions: FolderSuggestion[] = existing.map((path) => ({ path, create: false }));

    const candidate = normalizeRelPath(query);
    const known = existing.some((path) => path.toLowerCase() === candidate.toLowerCase());
    if (candidate !== '' && !known && isSaneFolder(candidate)) {
      suggestions.unshift({ path: candidate, create: true });
    }
    return suggestions;
  }

  override renderSuggestion(value: FolderSuggestion, el: HTMLElement): void {
    el.createDiv({ cls: 'vw-suggestion', text: label(value) });
  }

  override onChooseSuggestion(item: FolderSuggestion): void {
    this.onPick(item.path);
  }
}

function label(value: FolderSuggestion): string {
  if (value.create) return t('folder.pick.create', { path: value.path });
  return value.path === '' ? t('folder.pick.root') : value.path;
}
