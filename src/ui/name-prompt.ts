import { el } from '../core/dom';
import { checkPilotName, PILOT_NAME } from '../core/pilot-name';

/**
 * Asks for a pilot name. The same rules as the server run as you type, so you see why a name is refused before
 * you press Save. Resolves with the cleaned name, or null for "Not now".
 */
export function askPilotName(initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', class: 'name-input', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Pilot name', placeholder: 'Your pilot name' });
    input.value = initial;
    const message = el('p', { class: 'cd-sub name-message' });
    const save = el('button', { type: 'button', class: 'btn', text: 'Save' });
    const later = el('button', { type: 'button', class: 'btn ghost', text: 'Not now' });
    const root = el('div', { class: 'modal' }, [
      el('div', { class: 'panel choice-dialog', role: 'dialog', 'aria-label': 'Pilot name' }, [
        el('h2', { text: 'Pilot name' }),
        el('p', { class: 'cd-sub', text: `Shown on the leaderboard. ${PILOT_NAME.minLength} to ${PILOT_NAME.maxLength} characters: letters, numbers, emoji, space, _ - or .` }),
        input,
        message,
        el('div', { class: 'cd-buttons' }, [save, later]),
      ]),
    ]);

    const refresh = (): void => {
      const result = checkPilotName(input.value);
      save.disabled = !result.ok;
      message.textContent = input.value.trim() === '' ? '' : result.ok ? '' : result.reason;
    };
    const finish = (name: string | null): void => {
      root.remove();
      resolve(name);
    };
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (event) => {
      event.stopPropagation(); // typing a name must not trigger flight keys
      if (event.key === 'Enter' && !save.disabled) save.click();
      if (event.key === 'Escape') finish(null);
    });
    save.addEventListener('click', () => {
      const result = checkPilotName(input.value);
      if (result.ok) finish(result.name);
    });
    later.addEventListener('click', () => finish(null));
    document.body.append(root);
    refresh();
    input.focus();
  });
}
