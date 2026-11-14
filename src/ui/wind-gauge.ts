import { el } from '../core/dom';
import { formatSpeed, type DisplayUnits } from '../core/format';
import { createGaugePanel } from './gauge';

export interface WindState {
  /** False on maps without wind: the gauge is hidden. */
  isVisible: boolean;
  /** Which way the air is moving, relative to the drone's nose: 0 pushes you forward, PI is a headwind. */
  angleRad: number;
  speedMps: number;
}

/** An arrow showing where the wind pushes you (relative to your nose) and how hard. */
export class WindGauge {
  private readonly root: HTMLDivElement;
  private readonly arrow = el('i', { class: 'wind-arrow' });
  private readonly value = el('b', { class: 'hg-val' });

  constructor(parent: HTMLElement) {
    this.root = createGaugePanel(parent, 'wind-gauge', [el('span', { class: 'eyebrow', text: 'Wind' }), el('div', { class: 'wind-row' }, [this.arrow, this.value])]);
    this.root.hidden = true;
  }

  update(state: WindState, units: DisplayUnits, isTextFrame: boolean): void {
    this.root.hidden = !state.isVisible;
    if (!state.isVisible) return;
    // The arrow points where the air is going, relative to the nose (up on the screen).
    this.arrow.style.transform = `rotate(${(state.angleRad * 180) / Math.PI}deg)`;
    this.arrow.style.opacity = String(state.speedMps < 0.4 ? 0.25 : 1);
    if (isTextFrame) {
      const [number = '0', unit = 'km/h'] = formatSpeed(state.speedMps, units).split(' ');
      this.value.replaceChildren(number, el('small', { text: unit }));
    }
  }
}
