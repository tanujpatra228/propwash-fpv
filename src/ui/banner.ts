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

  show(title: string, subtitle: string, kind: BannerKind = 'info'): void {
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    this.root.classList.toggle('crash', kind === 'crash');
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
