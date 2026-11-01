import { el } from '../core/dom';

export interface LessonPanelState {
  number: number;
  total: number;
  title: string;
  steps: ReadonlyArray<{ text: string; isDone: boolean }>;
}

/** Training checklist, top left. Finished steps get a tick. */
export class LessonPanel {
  private readonly root: HTMLDivElement;
  private readonly eyebrow = el('span', { class: 'eyebrow' });
  private readonly title = el('b');
  private readonly list = el('ol');
  private lastKey = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'panel lesson-panel', hidden: true }, [this.eyebrow, this.title, this.list]);
    parent.append(this.root);
  }

  update(state: LessonPanelState | null): void {
    this.root.hidden = state === null;
    if (!state) return;
    const key = `${state.number}|${state.steps.map((s) => (s.isDone ? '1' : '0')).join('')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.eyebrow.textContent = `Training · Lesson ${state.number} of ${state.total}`;
    this.title.textContent = state.title;
    this.list.replaceChildren(...state.steps.map((s) => el('li', { class: s.isDone ? 'done' : undefined, text: s.text })));
  }
}
