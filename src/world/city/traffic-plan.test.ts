import { describe, expect, it } from 'vitest';
import { CITY } from '../../config';
import { blocksTravelled, buildTraffic, vehiclePose, type VehiclePose } from './traffic-plan';

const T = CITY.traffic;
const traffic = buildTraffic();
const pose = (): VehiclePose => ({ x: 0, z: 0, yawRad: 0, speedMps: 0 });
const AVENUES = [-240, -120, 0, 120, 240];

describe('traffic plan', () => {
  it('is deterministic and busy enough', () => {
    expect(JSON.stringify(buildTraffic())).toBe(JSON.stringify(traffic));
    expect(traffic.length).toBeGreaterThan(150);
    expect(traffic.length).toBeLessThan(450);
  });
  it('moves exactly one block per green and then waits', () => {
    expect(blocksTravelled(true, 0)).toBe(0);
    expect(blocksTravelled(true, T.greenS)).toBeCloseTo(1);
    expect(blocksTravelled(true, T.cycleS - 0.1)).toBeCloseTo(1);
    expect(blocksTravelled(true, T.cycleS + T.greenS)).toBeCloseTo(2);
    // The other axis does not move while this one does.
    expect(blocksTravelled(false, T.greenS - 1)).toBeCloseTo(0);
    expect(blocksTravelled(false, T.cycleS / 2 + T.greenS)).toBeCloseTo(1);
  });
  it('stopped vehicles never sit in an intersection, at any time they are stopped', () => {
    const half = CITY.avenueWidthM / 2;
    const p = pose();
    for (const v of traffic) {
      for (const t of [0, T.greenS + 1, T.cycleS + T.greenS + 1, 3 * T.cycleS + 30, 10 * T.cycleS + 5]) {
        vehiclePose(v, t, p);
        if (p.speedMps > 0.01) continue;
        const along = v.alongZ ? p.z : p.x;
        const nearest = AVENUES.reduce((best, a) => (Math.abs(a - along) < Math.abs(best - along) ? a : best), 0);
        if (Math.abs(along) > 330) continue; // outside the playable area
        expect(Math.abs(along - nearest) >= half + v.lengthM / 2 - 0.5).toBe(true);
      }
    }
  });
  it('vehicles in a lane keep their gaps while moving', () => {
    const lanes = new Map<string, Array<{ s: number; len: number }>>();
    for (const v of traffic) {
      const key = `${v.alongZ}|${v.avenue}|${v.direction}`;
      const list = lanes.get(key) ?? [];
      list.push({ s: v.startM, len: v.lengthM });
      lanes.set(key, list);
    }
    for (const list of lanes.values()) {
      list.sort((a, b) => a.s - b.s);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        if (a && b) expect(b.s - a.s).toBeGreaterThanOrEqual((a.len + b.len) / 2 + T.minGapM - 0.01);
      }
    }
  });
  it('speed is zero while stopped and positive while moving', () => {
    const v = traffic[0];
    const p = pose();
    if (!v) throw new Error('no traffic');
    expect(vehiclePose(v, T.greenS / 2 + (v.alongZ ? 0 : T.cycleS / 2), p).speedMps).toBeGreaterThan(5);
    expect(vehiclePose(v, T.greenS + 1 + (v.alongZ ? 0 : T.cycleS / 2), p).speedMps).toBe(0);
  });
});
