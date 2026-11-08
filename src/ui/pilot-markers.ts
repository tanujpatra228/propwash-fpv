import { ROOMS } from '../config';
import { el } from '../core/dom';
import { formatDistance, type DisplayUnits } from '../core/format';
import type { HudOther } from './hud-state';

interface Tag {
  root: HTMLDivElement;
  name: HTMLElement;
  distance: HTMLElement;
}

/**
 * Name tags above the other pilots in a live race: a clear name with a small distance underneath, fading with distance.
 * Only pilots on screen get one, so a full lobby never piles labels on the screen edge.
 */
export class PilotMarkers {
  private readonly tags: Tag[] = [];

  constructor(parent: HTMLElement) {
    for (let i = 0; i < ROOMS.maxPilots; i++) {
      const name = el('b');
      const distance = el('small');
      const root = el('div', { class: 'pilot-tag', hidden: true }, [name, distance]);
      parent.append(root);
      this.tags.push({ root, name, distance });
    }
  }

  update(others: readonly HudOther[], units: DisplayUnits, isTextFrame: boolean): void {
    for (let i = 0; i < this.tags.length; i++) {
      const tag = this.tags[i];
      if (!tag) continue;
      const other = others[i];
      const isShown = other !== undefined && other.isOnScreen;
      tag.root.hidden = !isShown;
      if (!other || !isShown) continue;
      tag.root.style.transform = `translate(${(other.ndcX * 0.5 + 0.5) * window.innerWidth}px, ${(-other.ndcY * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
      tag.root.style.opacity = String(other.opacity01);
      if (isTextFrame) {
        if (tag.name.textContent !== other.name) tag.name.textContent = other.name;
        tag.distance.textContent = formatDistance(other.distM, units);
      }
    }
  }
}
