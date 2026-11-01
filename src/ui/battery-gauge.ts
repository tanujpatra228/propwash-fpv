import { HUD } from '../config';
import { el } from '../core/dom';
import { formatPercent, formatTimeLeft } from '../core/format';
import { createGaugePanel } from './gauge';

export type BatteryState = 'ok' | 'warn' | 'bad';

export function batteryState(charge01: number): BatteryState {
  if (charge01 >= HUD.battery.greenAbove01) return 'ok';
  if (charge01 >= HUD.battery.yellowAbove01) return 'warn';
  return 'bad';
}

/** Charge %, a bar and the estimated time left. Turns yellow below 50% and red below 20%. */
export class BatteryGauge {
  private readonly root: HTMLDivElement;
  private readonly percent = el('b', { class: 'hg-val' });
  private readonly time = el('small', { class: 'bg-time' });
  private readonly fill = el('i');

  constructor(parent: HTMLElement) {
    this.root = createGaugePanel(parent, 'battery-gauge', [
      el('span', { class: 'eyebrow', text: 'Battery' }),
      this.percent,
      el('div', { class: 'bg-bar' }, [this.fill]),
      this.time,
    ]);
  }

  update(charge01: number, timeLeftS: number, swapProgress01 = 0): void {
    this.percent.textContent = formatPercent(charge01);
    this.time.textContent = swapProgress01 > 0 ? `swapping ${formatPercent(swapProgress01)}` : formatTimeLeft(timeLeftS);
    this.fill.style.width = `${Math.max(0, Math.min(1, charge01)) * 100}%`;
    const state = batteryState(charge01);
    this.root.classList.toggle('warn', state === 'warn');
    this.root.classList.toggle('bad', state === 'bad');
  }
}
