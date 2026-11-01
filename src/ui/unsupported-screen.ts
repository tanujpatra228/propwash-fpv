import { el } from '../core/dom';

/**
 * Full-screen notice for phones and tablets. Resolves when the player chooses to continue anyway
 * (for desktop browsers wrongly flagged as touch-only).
 */
export function showUnsupportedScreen(): Promise<void> {
  return new Promise((resolve) => {
    const continueButton = el('button', { type: 'button', class: 'unsupported-continue', text: 'I am on a computer with a keyboard and mouse: continue anyway' });
    const screen = el('section', { class: 'unsupported', role: 'alert' }, [
      el('div', { class: 'logo' }, [el('span', { text: 'Prop' }), el('br'), 'wash']),
      el('h1', { text: 'Not supported on mobile devices' }),
      el('p', { text: 'Propwash needs a keyboard and a mouse to fly. Please open this page on a desktop or laptop computer.' }),
      continueButton,
    ]);
    continueButton.addEventListener('click', () => {
      screen.remove();
      resolve();
    });
    document.body.append(screen);
  });
}
