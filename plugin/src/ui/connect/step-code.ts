import { Setting } from 'obsidian';
import { t } from '../../i18n/ru';
import { parseConnectionCode, serverHost } from './code';
import { errorText, infoRow } from './rows';
import type { StepHost } from './state';

/**
 * Шаг кода подключения. Разбор идёт на каждый ввод, но перерисовывается только
 * карточка ниже поля: человек должен видеть, куда подключается, до перехода
 * дальше, а полная перерисовка отбирала бы фокус у поля ввода.
 */
export function renderCodeStep(root: HTMLElement, host: StepHost): void {
  const state = host.state;
  new Setting(root).setName(t('connect.code.heading')).setHeading();

  new Setting(root)
    .setName(t('connect.code.name'))
    .setDesc(t('connect.code.desc'))
    .addTextArea((area) => {
      area.setPlaceholder(t('connect.code.placeholder'));
      area.setValue(state.code);
      area.onChange((raw) => {
        state.code = raw;
        const parsed = parseConnectionCode(raw);
        state.payload = parsed.ok ? parsed.payload : null;
        state.codeError = parsed.ok ? null : parsed.error;
        state.error = null;
        paint();
      });
    });

  const details = root.createDiv({ cls: 'vw-hint' });
  paint();

  function paint(): void {
    details.empty();
    const payload = state.payload;
    if (payload !== null) {
      infoRow(details, t('connect.code.server'), serverHost(payload.u));
      infoRow(details, t('connect.code.space'), payload.s);
      return;
    }
    if (state.code.trim().length > 0 && state.codeError !== null) {
      errorText(details, t(`connect.code.error.${state.codeError}`));
    }
  }
}
