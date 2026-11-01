import { el } from '../core/dom';
import { formatLapTime, formatSplit } from '../core/format';

export interface RacePanelState {
  lap: number;
  lapTimeS: number;
  lastLapS: number | null;
  bestLapS: number | null;
  splitDeltaS: number | null;
}

/** Time-trial panel, top left: lap, current lap time, last and best lap, and the gap at the last gate. */
export class RacePanel {
  private readonly root: HTMLDivElement;
  private readonly lap = el('b', { class: 'rp-val' });
  private readonly time = el('b', { class: 'rp-time' });
  private readonly last = el('b', { class: 'rp-val' });
  private readonly best = el('b', { class: 'rp-val' });
  private readonly split = el('span', { class: 'rp-split' });

  constructor(parent: HTMLElement) {
    const cell = (label: string, value: HTMLElement): HTMLElement => el('div', {}, [el('span', { text: label }), value]);
    this.root = el('div', { class: 'panel race-panel', hidden: true }, [
      el('div', { class: 'rp-main' }, [this.time, this.split]),
      el('div', { class: 'rp-rows' }, [cell('Lap', this.lap), cell('Last', this.last), cell('Best', this.best)]),
    ]);
    parent.append(this.root);
  }

  setVisible(isVisible: boolean): void {
    this.root.hidden = !isVisible;
  }

  update(state: RacePanelState, isTextFrame: boolean): void {
    if (this.root.hidden || !isTextFrame) return;
    this.lap.textContent = String(state.lap);
    this.time.textContent = formatLapTime(state.lapTimeS);
    this.last.textContent = state.lastLapS === null ? '--' : formatLapTime(state.lastLapS);
    this.best.textContent = state.bestLapS === null ? '--' : formatLapTime(state.bestLapS);
    const delta = state.splitDeltaS;
    this.split.textContent = delta === null ? '' : formatSplit(delta);
    this.split.classList.toggle('faster', delta !== null && delta < 0);
    this.split.classList.toggle('slower', delta !== null && delta >= 0);
  }
}
