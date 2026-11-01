import { el } from '../core/dom';

/** Small "Best lap" label that follows the ghost drone on screen. */
export class GhostTag {
  private readonly root = el('div', { class: 'ghost-tag', hidden: true, text: 'Best lap' });

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  /** `ndcX`/`ndcY` are normalised device coordinates (-1..1). Hidden when off-screen or behind the camera. */
  update(isVisible: boolean, ndcX: number, ndcY: number): void {
    this.root.hidden = !isVisible;
    if (!isVisible) return;
    this.root.style.transform = `translate(${(ndcX * 0.5 + 0.5) * window.innerWidth}px, ${(-ndcY * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
  }
}

/** Whether a projected point is on screen and in front of the camera, with a small margin. Pure. */
export function isOnScreen(ndcX: number, ndcY: number, ndcZ: number, margin = 0.05): boolean {
  return ndcZ < 1 && Math.abs(ndcX) < 1 - margin && Math.abs(ndcY) < 1 - margin;
}
