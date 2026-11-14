import { describe, expect, it } from 'vitest';
import { windAcceleration, type WindAccel, type WindZone } from './wind';

const zone: WindZone = { x: 0, z: 0, radiusM: 100, directionDeg: 90, strength: 3, gustPeriodS: 10, gustPhase: 0 };
const out = (): WindAccel => ({ x: 0, y: 0, z: 0 });

describe('windAcceleration', () => {
  it('is zero outside every zone', () => {
    const w = windAcceleration([zone], 150, 0, 3, 0.65, 4, out());
    expect([w.x, w.y, w.z]).toEqual([0, 0, 0]);
  });
  it('blows the way the zone points (90 degrees is toward +X, 0 toward -Z)', () => {
    const east = windAcceleration([zone], 0, 0, 2.5, 0.65, 4, out());
    expect(east.x).toBeGreaterThan(0);
    expect(Math.abs(east.z)).toBeLessThan(1e-9);
    const north = windAcceleration([{ ...zone, directionDeg: 0 }], 0, 0, 2.5, 0.65, 4, out());
    expect(north.z).toBeLessThan(0);
  });
  it('is strongest in the middle and fades to nothing at the edge', () => {
    const centre = windAcceleration([zone], 0, 0, 2.5, 0.65, 4, out()).x;
    const mid = windAcceleration([zone], 70, 0, 2.5, 0.65, 4, out()).x;
    const edge = windAcceleration([zone], 99.9, 0, 2.5, 0.65, 4, out()).x;
    expect(centre).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(edge);
    expect(edge).toBeLessThan(0.01);
  });
  it('gusts between 65% and 100% of the strength', () => {
    let min = Infinity;
    let max = 0;
    for (let t = 0; t < 10; t += 0.1) {
      const x = windAcceleration([zone], 0, 0, t, 0.65, 4, out()).x;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    expect(min).toBeCloseTo(3 * 0.65, 1);
    expect(max).toBeCloseTo(3, 1);
  });
  it('is the same at the same time (deterministic) and capped when zones overlap', () => {
    expect(windAcceleration([zone], 10, 10, 4.2, 0.65, 4, out())).toEqual(windAcceleration([zone], 10, 10, 4.2, 0.65, 4, out()));
    const strong = windAcceleration([zone, zone, zone], 0, 0, 2.5, 1, 4, out());
    expect(Math.hypot(strong.x, strong.z)).toBeLessThanOrEqual(4.0001);
  });
});
