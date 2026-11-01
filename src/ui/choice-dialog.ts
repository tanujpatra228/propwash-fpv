import { el } from '../core/dom';

export interface Choice<Id extends string> {
  id: Id;
  label: string;
  /** The suggested option; it gets focus so Enter picks it. */
  isPrimary?: boolean;
}

/** A small centre-screen dialog with a message and a few buttons ("Lesson complete: what next?"). */
export class ChoiceDialog<Id extends string> {
  private readonly root: HTMLDivElement;
  private readonly title = el('h2');
  private readonly subtitle = el('p', { class: 'cd-sub' });
  private readonly buttons = el('div', { class: 'cd-buttons' });

  constructor() {
    this.root = el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel choice-dialog', role: 'dialog', 'aria-live': 'polite' }, [this.title, this.subtitle, this.buttons]),
    ]);
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(title: string, subtitle: string, choices: ReadonlyArray<Choice<Id>>, onChoose: (id: Id) => void): void {
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    const nodes = choices.map((choice) => {
      const button = el('button', { type: 'button', class: choice.isPrimary ? 'btn' : 'btn ghost', text: choice.label });
      button.addEventListener('click', () => {
        this.hide();
        onChoose(choice.id);
      });
      return button;
    });
    this.buttons.replaceChildren(...nodes);
    this.root.hidden = false;
    const primary = choices.findIndex((c) => c.isPrimary);
    nodes[primary >= 0 ? primary : 0]?.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
