/**
 * Заглушка пакета obsidian для тестов. У настоящего пакета нет рантайма вне
 * приложения: он поставляет только типы, поэтому любой модуль, импортирующий
 * его хотя бы транзитивно, в vitest не поднимался. Здесь ровно то, что нужно
 * тестам, без попытки повторить поведение приложения.
 */

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isPhone: false,
  isTablet: false,
  isIosApp: false,
  isAndroidApp: false,
};

export const apiVersion = '1.12.0';

export class Notice {
  constructor(readonly message: string) {}
  hide(): void {}
}

export class Modal {
  containerEl = null;
  open(): void {}
  close(): void {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ButtonComponent {}
export class ItemView {}
export class MarkdownView {}
export class TFile {}
export class TFolder {}

export function setIcon(): void {}
export function normalizePath(path: string): string {
  return path;
}

/** Реальные запросы в тестах не идут: каждый тест подсовывает свой транспорт. */
export function requestUrl(): never {
  throw new Error('requestUrl в тестах не используется, передайте свой RequestFn');
}
