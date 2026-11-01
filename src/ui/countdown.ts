import { el } from '../core/dom';

/** Big "3, 2, 1, GO" in the middle of the screen. */
export class Countdown {
  private readonly root = el('div', { class: 'countdown', hidden: true });

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  update(text: string): void {
    this.root.hidden = text === '';
    if (this.root.textContent !== text) this.root.textContent = text;
    this.root.classList.toggle('go', text === 'GO');
  }
}
