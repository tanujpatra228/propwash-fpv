import { el } from '../core/dom';

/** One line of current key hints at the bottom of the screen. */
export class HelpBar {
  private readonly root = el('div', { class: 'panel controls-help' });

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  setText(text: string): void {
    this.root.textContent = text;
  }
}
