import { MathUtils } from 'three';
import { el } from '../core/dom';
import { formatSpeed, formatTimer } from '../core/format';
import { valueNoise } from '../core/math';
import type { HudState } from './hud-state';

const LINK_QUALITY_BASE = 97;
const LINK_QUALITY_SPREAD = 3;
const LOW_BATTERY_BLINK_HZ = 2;

/** FPV on-screen display: battery, timer, horizon, mode, throttle. Shown in the goggles view only. */
export class Osd {
  private readonly root: HTMLDivElement;
  private readonly volts = el('span');
  private readonly mah = el('span');
  private readonly lowBattery = el('span', { class: 'warn', text: 'LOW BATTERY', hidden: true });
  private readonly link = el('span');
  private readonly timer = el('span');
  private readonly throttle = el('span');
  private readonly speed = el('span');
  private readonly horizon = el('div', { class: 'horizon' });

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'osd', hidden: true }, [
      el('div', { class: 'osd-tl' }, [this.volts, this.mah, this.lowBattery]),
      el('div', { class: 'osd-tr' }, [el('span', { class: 'rec', text: '● REC' }), this.link, this.timer]),
      el('div', { class: 'osd-center' }, [this.horizon, el('div', { class: 'crosshair' })]),
      el('div', { class: 'osd-bl' }, [el('span', { text: 'ANGLE' }), this.throttle]),
      el('div', { class: 'osd-br' }, [this.speed]),
    ]);
    parent.append(this.root);
  }

  setVisible(isVisible: boolean): void {
    this.root.hidden = !isVisible;
  }

  update(state: HudState, timeS: number, isTextFrame: boolean): void {
    if (this.root.hidden) return;
    const pitchDeg = MathUtils.radToDeg(state.pitchRad) + state.uptiltDeg;
    const rollDeg = MathUtils.radToDeg(state.rollRad);
    this.horizon.style.transform = `translateY(${pitchDeg * (window.innerHeight / state.fovDeg)}px) rotate(${rollDeg}deg)`;
    if (!isTextFrame) return;
    this.volts.textContent = `${state.voltage.toFixed(1)}V`;
    this.volts.classList.toggle('warn', state.isBatteryLow);
    this.mah.textContent = `${Math.round(state.mAhUsed)}mAh`;
    const isBlinkOn = Math.floor(timeS * LOW_BATTERY_BLINK_HZ * 2) % 2 === 0;
    this.lowBattery.hidden = !(state.isBatteryLow && isBlinkOn) && !state.isBatteryEmpty;
    this.lowBattery.textContent = state.isBatteryEmpty ? 'BATTERY EMPTY' : 'LOW BATTERY';
    this.link.textContent = `LQ ${LINK_QUALITY_BASE + Math.floor((valueNoise(timeS * 0.7, 3.1) * 0.5 + 0.5) * LINK_QUALITY_SPREAD)}`;
    this.timer.textContent = formatTimer(state.flightTimeS);
    this.throttle.textContent = `THR ${Math.round(state.throttle01 * 100)}%`;
    this.speed.textContent = formatSpeed(state.speedMps, state.units);
  }
}
