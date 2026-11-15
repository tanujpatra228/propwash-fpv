import { describe, expect, it } from 'vitest';
import { BATTERY } from '../config';
import { AudioDirector, type DirectorFrame } from './audio-director';

const base: DirectorFrame = { dtS: 0.016, countdownText: '', lastPassedGate: -1, completedLaps: 0, isLastLapBest: false, charge01: 1, isLow: false, isEmpty: false, isCrashed: false, isActive: true };
const types = (d: AudioDirector, f: Partial<DirectorFrame>) => d.update({ ...base, ...f }).map((e) => e.type);

describe('AudioDirector', () => {
  it('ticks once per countdown number and says GO once', () => {
    const d = new AudioDirector();
    expect(types(d, { countdownText: '3' })).toEqual(['tick']);
    expect(types(d, { countdownText: '3' })).toEqual([]);
    expect(types(d, { countdownText: '2' })).toEqual(['tick']);
    expect(types(d, { countdownText: 'GO' })).toEqual(['go']);
    expect(types(d, { countdownText: 'GO' })).toEqual([]);
    expect(types(d, { countdownText: '' })).toEqual([]);
  });

  it('pings each gate once, rising in a streak, and resets the streak after a crash', () => {
    const d = new AudioDirector();
    const streaks: number[] = [];
    const gate = (index: number, extra: Partial<DirectorFrame> = {}): void => {
      for (const e of d.update({ ...base, lastPassedGate: index, ...extra })) if (e.type === 'gate') streaks.push(e.streak);
    };
    gate(0);
    gate(0);
    gate(1);
    gate(2);
    gate(2, { isCrashed: true });
    gate(2, { isCrashed: false });
    gate(3);
    expect(streaks).toEqual([0, 1, 2, 0]);
  });

  it('plays a lap chime instead of a gate ping at the line, and marks a personal best', () => {
    const d = new AudioDirector();
    d.update({ ...base, lastPassedGate: 5 });
    const events = d.update({ ...base, lastPassedGate: 0, completedLaps: 1, isLastLapBest: true });
    expect(events).toEqual([{ type: 'lap', isBest: true }]);
    expect(d.update({ ...base, lastPassedGate: 0, completedLaps: 1, isLastLapBest: true })).toEqual([]);
  });

  it('starts the streak over when the run is reset', () => {
    const d = new AudioDirector();
    d.update({ ...base, lastPassedGate: 0 });
    d.update({ ...base, lastPassedGate: 1 });
    d.update({ ...base, lastPassedGate: -1 });
    const events = d.update({ ...base, lastPassedGate: 0 });
    expect(events).toEqual([{ type: 'gate', streak: 0 }]);
  });

  it('beeps while the battery is low, faster as it drains, and stops when empty, crashed or in a menu', () => {
    const d = new AudioDirector();
    const low = { isLow: true, charge01: BATTERY.lowChargeThreshold01, dtS: 0.5 };
    let beeps = 0;
    for (let i = 0; i < 8; i++) beeps += d.update({ ...base, ...low }).filter((e) => e.type === 'batteryBeep').length;
    expect(beeps).toBeGreaterThanOrEqual(2);
    expect(beeps).toBeLessThanOrEqual(4);
    const nearEmpty = new AudioDirector();
    let fast = 0;
    for (let i = 0; i < 8; i++) fast += nearEmpty.update({ ...base, ...low, charge01: 0.01 }).filter((e) => e.type === 'batteryBeep').length;
    expect(fast).toBeGreaterThan(beeps);
    expect(types(d, { ...low, isEmpty: true })).toEqual([]);
    expect(types(d, { ...low, isCrashed: true })).toEqual([]);
    expect(types(d, { ...low, isActive: false })).toEqual([]);
  });

  it('says nothing in a menu and forgets the countdown', () => {
    const d = new AudioDirector();
    d.update({ ...base, countdownText: '3' });
    expect(types(d, { isActive: false, countdownText: '2' })).toEqual([]);
    expect(types(d, { countdownText: '3' })).toEqual(['tick']);
  });
});
