import type { ConnectionSettings } from './types';

/**
 * Пароль шифрования кладётся в data.json как есть. Шифровать его нечем: ключ
 * пришлось бы держать рядом, в том же файле хранилища, и защита была бы ложной.
 * Цена названа честно в описании переключателя и в README.
 */
export function storePassword(
  connection: ConnectionSettings,
  password: string,
  remember: boolean,
): void {
  connection.rememberPassword = remember;
  connection.password = remember ? password : null;
}

/** Пароль забыт: его попросили стереть или он перестал подходить пространству. */
export function forgetPassword(connection: ConnectionSettings): void {
  connection.rememberPassword = false;
  connection.password = null;
}

export interface RememberToggleDeps {
  readonly connection: ConnectionSettings;
  save(): Promise<void>;
  /** Включение: пароль надо получить и проверить, окно разблокировки сохранит его само. */
  requestPassword(): void;
}

/**
 * Переключатель «запомнить пароль» в настройках подключения. Выключение стирает
 * пароль немедленно, не дожидаясь кнопки сохранения: человек просил забыть его
 * сейчас, а не когда-нибудь.
 */
export async function toggleRemember(deps: RememberToggleDeps, value: boolean): Promise<void> {
  if (value) {
    deps.requestPassword();
    return;
  }
  forgetPassword(deps.connection);
  await deps.save();
}
