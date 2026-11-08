import { ROOMS } from '../config';
import { el } from '../core/dom';
import { formatDistance, type DisplayUnits } from '../core/format';
import type { HudOther } from './hud-state';

const cssColor = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

interface Pin {
  root: HTMLDivElement;
  name: HTMLElement;
  distance: HTMLElement;
}

/** Pins that follow the other pilots in a live race: a coloured dot, name and distance. Off-screen pilots stick to the screen edge. */
export class PilotMarkers {
  private readonly pins: Pin[] = [];

  constructor(parent: HTMLElement) {
    for (let i = 0; i < ROOMS.maxPilots; i++) {
      const name = el('b');
      const distance = el('small');
      const root = el('div', { class: 'pilot-pin', hidden: true }, [el('i'), el('span', {}, [name, distance])]);
      parent.append(root);
      this.pins.push({ root, name, distance });
    }
  }

  update(others: readonly HudOther[], units: DisplayUnits, isTextFrame: boolean): void {
    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i];
      if (!pin) continue;
      const other = others[i];
      pin.root.hidden = !other;
      if (!other) continue;
      pin.root.style.transform = `translate(${(other.ndcX * 0.5 + 0.5) * window.innerWidth}px, ${(-other.ndcY * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -50%)`;
      pin.root.classList.toggle('off', !other.isOnScreen);
      if (isTextFrame) {
        pin.root.style.setProperty('--pin', cssColor(other.color));
        if (pin.name.textContent !== other.name) pin.name.textContent = other.name;
        pin.distance.textContent = formatDistance(other.distM, units);
      }
    }
  }
}
