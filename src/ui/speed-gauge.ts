import { el } from '../core/dom';
import { formatSpeedKmh } from '../core/format';
import { createGaugePanel } from './gauge';

/** Ground speed, shown in both cameras so the pilot can judge how fast they are going. */
export class SpeedGauge {
  private readonly value = el('b', { class: 'hg-val' });

  constructor(parent: HTMLElement) {
    createGaugePanel(parent, 'speed-gauge', [el('span', { class: 'eyebrow', text: 'Speed' }), this.value]);
  }

  update(speedMps: number): void {
    const [number = '0', unit = 'km/h'] = formatSpeedKmh(speedMps).split(' ');
    this.value.replaceChildren(number, el('small', { text: unit }));
  }
}
