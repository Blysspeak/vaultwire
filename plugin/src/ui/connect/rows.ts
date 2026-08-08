/** Строка «ключ — значение» в карточках мастера и предпросмотра. */
export function infoRow(parent: HTMLElement, key: string, value: string): void {
  const row = parent.createDiv({ cls: 'vw-card-row' });
  row.createSpan({ cls: 'vw-card-key', text: key });
  row.createSpan({ cls: 'vw-card-value', text: value });
}

export function errorText(parent: HTMLElement, text: string): void {
  parent.createDiv({ cls: 'vw-error', text });
}
