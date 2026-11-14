import { beforeAll, describe, expect, it, vi } from 'vitest';

/** The harbor must be the active track before `config.ts` loads, so it is imported after the stubs. */
async function loadHarbor() {
  vi.resetModules();
  vi.stubGlobal('location', { search: '?track=harbor' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const config = await import('../../config');
  const trackModule = await import('../track');
  const planModule = await import('./plan');
  const terrain = await import('../terrain');
  return { config, track: trackModule.track, gateSampleIndex: trackModule.gateSampleIndex, plan: planModule.buildHarborPlan(), terrain, planModule };
}

describe('Harbor Run track', () => {
  let h: Awaited<ReturnType<typeof loadHarbor>>;
  beforeAll(async () => {
    h = await loadHarbor();
  });

  it('is the active track with its own bounds and version', () => {
    expect(h.config.ACTIVE_TRACK_ID).toBe('harbor');
    expect(h.config.WORLD.version).toBe(103);
    expect(h.config.WORLD.bounds.halfSizeM).toBe(360);
    expect(h.config.RENDER.isNight).toBe(false);
    expect(h.config.RENDER.lightElevationDeg).toBeLessThan(10); // low golden sun
  });
  it('is a loop of the intended length', () => {
    expect(h.track.lengthM).toBeGreaterThan(1000);
    expect(h.track.lengthM).toBeLessThan(1800);
  });
  it('stays in the world, above the ground and clear of the water surface', () => {
    const { halfSizeM, ceilingM } = h.config.WORLD.bounds;
    for (const p of h.track.positions) {
      expect(Math.abs(p.x)).toBeLessThan(halfSizeM - 4);
      expect(Math.abs(p.z)).toBeLessThan(halfSizeM - 4);
      expect(p.y).toBeLessThan(ceilingM - 5);
      expect(p.y - h.terrain.groundY(p.x, p.z)).toBeGreaterThan(1.8);
    }
  });
  it('never touches a static solid (1.2 m margin)', () => {
    const margin = 1.2;
    const hits: string[] = [];
    for (const [i, p] of h.track.positions.entries()) {
      for (const b of h.plan.solids) {
        if (Math.abs(p.x - b.x) < b.sx / 2 + margin && Math.abs(p.y - b.y) < b.sy / 2 + margin && Math.abs(p.z - b.z) < b.sz / 2 + margin) {
          hits.push(`sample ${i} at ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)} hits ${b.kind} at ${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)}`);
        }
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  });
  it('places 12 gates in order, gate 0 at the start', () => {
    const indices = Array.from({ length: 12 }, (_, i) => h.gateSampleIndex(i));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(12);
    const start = h.track.positions[indices[0] ?? 0];
    expect(Math.hypot((start?.x ?? 0) + 230, (start?.z ?? 0) + 128)).toBeLessThan(12);
  });
  it('the pit pad by the start is on land, so free flight does not begin in the water', async () => {
    const { PIT_PAD } = await import('../pit-area');
    expect(h.planModule.isLand(PIT_PAD.position.x, PIT_PAD.position.z)).toBe(true);
  });
  it('terrain says water over the basin and land on the quay', () => {
    const surface = { y: 0, isWater: false };
    h.terrain.surfaceAt(0, 0, surface);
    expect(surface).toEqual({ y: 0, isWater: true });
    h.terrain.surfaceAt(-232, -128, surface);
    expect(surface).toEqual({ y: 1, isWater: false });
  });
});
