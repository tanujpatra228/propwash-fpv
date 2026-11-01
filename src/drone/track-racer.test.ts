import { describe, expect, it } from 'vitest';
import { MENU } from '../config';
import { track } from '../world/track';
import { TrackRacer } from './track-racer';

const make = (topSpeedMps = 25, startDistM = 0): TrackRacer => new TrackRacer({ topSpeedMps, lateralOffsetM: 0, phase: 1, startDistM });

describe('TrackRacer', () => {
  it('speeds up from rest toward its top speed', () => {
    const r = make();
    for (let t = 0; t < 10; t += 1 / 60) r.step(1 / 60, t);
    expect(r.speedMps).toBeGreaterThan(5);
    expect(r.speedMps).toBeLessThanOrEqual(25 * 1.03);
  });

  it('stays on the track and keeps finite poses for a whole lap and more', () => {
    const r = make(30);
    let t = 0;
    for (; t < (track.lengthM / 20) * 1.3; t += 1 / 30) {
      r.step(1 / 30, t);
      expect(Number.isFinite(r.position.x + r.position.y + r.position.z)).toBe(true);
      expect(Number.isFinite(r.quaternion.lengthSq())).toBe(true);
      expect(track.distanceToLineXZ(r.position.x, r.position.z)).toBeLessThan(8);
    }
    expect(r.distM).toBeGreaterThanOrEqual(0);
    expect(r.distM).toBeLessThan(track.lengthM);
  });

  it('never pulls more sideways acceleration than allowed (it slows for bends)', () => {
    const r = make(60); // would be far too fast for the bends if unchecked
    let worst = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      r.step(1 / 30, t);
      if (t > 8) worst = Math.max(worst, track.curvatureMagnitudeAtDistance(r.distM) * r.speedMps ** 2);
    }
    expect(worst).toBeLessThan(MENU.maxLateralAccelMps2 * 1.6);
  });

  it('starts where it is told to', () => {
    const r = make(25, 300);
    r.step(1 / 60, 0);
    expect(r.distM).toBeGreaterThanOrEqual(300);
  });
});
