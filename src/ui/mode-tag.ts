import { el } from '../core/dom';

/** Small label top left with the mode name and a one-line hint (free flight; time trial shows the race panel instead). */
export class ModeTag {
  private readonly root: HTMLDivElement;
  private readonly title = el('b');
  private readonly hint = el('small');

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'panel mode-tag', hidden: true }, [this.title, this.hint]);
    parent.append(this.root);
  }

  update(isVisible: boolean, title: string, hint: string): void {
    this.root.hidden = !isVisible;
    if (!isVisible) return;
    if (this.title.textContent !== title) this.title.textContent = title;
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
  }
}
