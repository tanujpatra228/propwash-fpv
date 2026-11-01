import { el } from '../core/dom';

export type BannerKind = 'info' | 'crash';

/** The centre-screen message ("Crashed", "New best lap"). One element, text set through textContent. */
export class Banner {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;

  constructor() {
    this.title = el('b');
    this.subtitle = el('span');
    this.root = el('div', { class: 'banner panel', hidden: true, role: 'status' }, [this.title, this.subtitle]);
    document.body.append(this.root);
  }

  private remainingS = Infinity;

  /** Shows a message. With `seconds` it hides itself; without, it stays until `hide`. */
  show(title: string, subtitle: string, kind: BannerKind = 'info', seconds = Infinity): void {
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    this.root.classList.toggle('crash', kind === 'crash');
    this.root.hidden = false;
    this.remainingS = seconds;
  }

  hide(): void {
    this.root.hidden = true;
    this.remainingS = Infinity;
  }

  update(dtS: number): void {
    if (this.root.hidden || this.remainingS === Infinity) return;
    this.remainingS -= dtS;
    if (this.remainingS <= 0) this.hide();
  }
}
