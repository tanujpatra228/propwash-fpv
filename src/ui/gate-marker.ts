import { HUD } from '../config';
import { el } from '../core/dom';

/** Pushes a projected point to the screen edge when it is off-screen or behind the camera. Pure. */
export function clampToScreenEdge(x: number, y: number, isBehind: boolean, limit: number = HUD.markerEdgeLimit): { x: number; y: number } {
  let sx = isBehind ? -x : x;
  let sy = isBehind ? -y : y;
  const largest = Math.max(Math.abs(sx), Math.abs(sy));
  if (isBehind || largest > limit) {
    const divisor = largest === 0 ? 1 : largest;
    sx = (sx / divisor) * limit;
    sy = (sy / divisor) * limit;
  }
  return { x: sx, y: sy };
}

/** Diamond on the next gate with its distance, plus the "GATE n / 12" counter at the top. */
export class GateMarker {
  private readonly marker: HTMLDivElement;
  private readonly distance = el('span');
  private readonly counter = el('div', { class: 'panel gate-count' });

  constructor(parent: HTMLElement) {
    this.marker = el('div', { class: 'gate-marker' }, [el('i'), this.distance]);
    parent.append(this.marker, this.counter);
  }

  /** `ndcX`/`ndcY` are already edge-clamped (-1..1). */
  update(ndcX: number, ndcY: number, distM: number, isTextFrame: boolean): void {
    this.marker.style.transform = `translate(${(ndcX * 0.5 + 0.5) * window.innerWidth}px, ${(-ndcY * 0.5 + 0.5) * window.innerHeight}px)`;
    if (isTextFrame) this.distance.textContent = `${Math.round(distM)}m`;
  }

  setCounter(passed: number, total: number): void {
    this.counter.textContent = `GATE ${passed} / ${total}`;
  }
}
