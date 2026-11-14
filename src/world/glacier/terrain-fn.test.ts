import { describe, expect, it } from 'vitest';
import { GLACIER } from '../../config';
import { glacierHeight, isIce, mountainHeight, routeInfo, type RouteInfo } from './terrain-fn';

const info = (): RouteInfo => ({ distanceM: 0, floorY: 0, halfWidthM: 0 });

describe('glacier terrain function', () => {
  it('is deterministic', () => {
    for (const [x, z] of [[0, 0], [123.4, -88.8], [-300, 250], [420, 10]] as const) expect(glacierHeight(x, z)).toBe(glacierHeight(x, z));
  });
  it('sits at the floor height on the route', () => {
    for (const [x, z, floor] of GLACIER.route) expect(Math.abs(glacierHeight(x, z) - floor)).toBeLessThan(2.2);
  });
  it('rises into walls beside the canyon', () => {
    // The canyon runs through route points 12 to 14; stand beside it, well outside the carved floor.
    const [x, z, floor, half] = GLACIER.route[12] ?? [0, 0, 0, 9];
    const r = info();
    let wallHeight = 0;
    for (let d = half; d < half + 60; d += 2) {
      // Step sideways (perpendicular to the route's rough direction, which is toward -X, -Z).
      const sx = x + d * 0.35;
      const sz = z - d * 0.94;
      routeInfo(sx, sz, r);
      if (r.distanceM > half) wallHeight = Math.max(wallHeight, glacierHeight(sx, sz) - floor);
    }
    expect(wallHeight).toBeGreaterThan(40);
  });
  it('is mountainous away from the route and highest near the edge', () => {
    expect(mountainHeight(0, 0)).toBeGreaterThan(100);
    expect(mountainHeight(520, 0)).toBeGreaterThan(mountainHeight(100, 0));
  });
  it('has a frozen lake and no ice in the canyon or valley', () => {
    expect(isIce(-260, -190)).toBe(true);
    expect(isIce(-70, -270)).toBe(false);
    expect(isIce(0, 240)).toBe(false);
  });
});
