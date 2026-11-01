import { HUD } from '../config';
import { el } from '../core/dom';
import { formatHeight } from '../core/format';
import { createGaugePanel } from './gauge';

export type HeightState = 'ok' | 'low' | 'danger';

/** Colour state for a height, shared by this gauge and the 3D ground marker so they always agree. */
export function heightState(heightM: number): HeightState {
  if (heightM < HUD.height.dangerM) return 'danger';
  if (heightM < HUD.height.lowM) return 'low';
  return 'ok';
}

/** Height above ground, in metres. Square-root bar so the low range has more detail. */
export class HeightGauge {
  private readonly root: HTMLDivElement;
  private readonly value = el('b', { class: 'hg-val' });
  private readonly fill = el('i');

  constructor(parent: HTMLElement) {
    this.root = createGaugePanel(parent, 'height-gauge', [
      el('div', { class: 'hg-bar' }, [this.fill]),
      el('span', { class: 'eyebrow', text: 'Height' }),
      this.value,
    ]);
  }

  update(heightM: number): void {
    this.value.replaceChildren(formatHeight(heightM), el('small', { text: 'm' }));
    this.fill.style.height = `${Math.sqrt(Math.min(heightM, HUD.height.barScaleMaxM) / HUD.height.barScaleMaxM) * 100}%`;
    const state = heightState(heightM);
    this.root.classList.toggle('danger', state === 'danger');
    this.root.classList.toggle('low', state === 'low');
  }
}
