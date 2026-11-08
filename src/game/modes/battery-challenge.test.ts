import { describe, expect, it } from 'vitest';
import { TRACK } from '../../config';
import { findChallenge, type Records } from '../challenge-results';
import { BatteryChallenge } from './battery-challenge';
import { makeHost } from './test-host';

const frame = { isLanded: false };

function setup(id: string) {
  const saved: Records[] = [];
  const h = makeHost();
  const mode = new BatteryChallenge(h.host, { load: () => ({}), save: (r) => void saved.push(structuredClone(r)) });
  mode.setChallenge(findChallenge(id)!);
  mode.start();
  mode.update(3.5, frame); // countdown
  return { mode, saved, ...h };
}

/** Crosses the start line and every gate, then the line again, for `laps` laps; 2 s per gate. */
function flyLaps(mode: BatteryChallenge, laps: number): void {
  for (let i = 0; i < laps * TRACK.gateCount + 1; i++) {
    mode.update(2, frame);
    mode.onGateCrossed(i % TRACK.gateCount);
  }
}

describe('BatteryChallenge', () => {
  it('locks input during the countdown', () => {
    const h = makeHost();
    const mode = new BatteryChallenge(h.host, { load: () => ({}), save: () => undefined });
    mode.start();
    expect(mode.isInputLocked).toBe(true);
    mode.update(3.1, frame);
    expect(mode.isInputLocked).toBe(false);
  });
  it('finishing with battery left and under par gives 3 stars and pays credits once', () => {
    const { mode, offers, earned, battery } = setup('three');
    battery.charge01 = 0.5;
    // 3 laps at 24 s per lap is far under the 150 s par.
    for (let i = 0; i < 3 * TRACK.gateCount + 1; i++) {
      mode.update(2, frame);
      mode.onGateCrossed(i % TRACK.gateCount);
    }
    expect(offers[0]?.title).toBe('Challenge complete');
    expect(earned).toContain('starx3');
    expect(earned.filter((e) => e === 'lapx1')).toHaveLength(3);
  });
  it('running out of battery before the last lap fails the run', () => {
    const { mode, offers, battery, saved } = setup('three');
    flyLaps(mode, 1);
    battery.charge01 = 0;
    mode.update(0.1, { isLanded: true });
    expect(offers[0]?.title).toMatch(/Out of battery on lap 2/);
    expect(saved[0]?.['three']?.stars).toBe(0);
  });
  it('a finish at the last gate counts even as the battery hits zero right after', () => {
    const { mode, offers, battery } = setup('three');
    battery.charge01 = 0.02;
    flyLaps(mode, 3);
    expect(offers[0]?.title).toBe('Challenge complete');
  });
  it('endurance ends on empty and scores laps plus the lap fraction', () => {
    const { mode, offers, battery, saved } = setup('endurance');
    flyLaps(mode, 2);
    for (let i = 1; i <= 6; i++) {
      mode.update(2, frame);
      mode.onGateCrossed(i);
    }
    battery.charge01 = 0;
    mode.update(0.1, { isLanded: true });
    expect(offers[0]?.title).toBe('Battery empty');
    expect(saved[0]?.['endurance']?.bestScore).toBeCloseTo(2 + 7 / TRACK.gateCount, 1);
  });
  it('reset after the run starts a fresh attempt', () => {
    const { mode, battery } = setup('three');
    battery.charge01 = 0;
    mode.update(0.1, { isLanded: true });
    expect(mode.handleReset()).toBe(true);
    expect(mode.isInputLocked).toBe(true);
  });
});
