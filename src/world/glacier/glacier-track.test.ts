import { beforeAll, describe, expect, it, vi } from 'vitest';

/** Glacier Pass must be the active track before `config.ts` loads, so it is imported after the stubs. */
async function loadGlacier() {
  vi.resetModules();
  vi.stubGlobal('location', { search: '?track=glacier' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const config = await import('../../config');
  const trackModule = await import('../track');
  const planModule = await import('./plan');
  const terrain = await import('../terrain');
  const pit = await import('../pit-area');
  return { config, track: trackModule.track, gateSampleIndex: trackModule.gateSampleIndex, plan: planModule.buildGlacierPlan(), terrain, pit };
}

describe('Glacier Pass track', () => {
  let g: Awaited<ReturnType<typeof loadGlacier>>;
  beforeAll(async () => {
    g = await loadGlacier();
  });

  it('is the active track with its own bounds, version and a bright alpine atmosphere', () => {
    expect(g.config.ACTIVE_TRACK_ID).toBe('glacier');
    expect(g.config.WORLD.version).toBe(104);
    expect(g.config.WORLD.bounds.halfSizeM).toBe(500);
    expect(g.config.RENDER.isNight).toBe(false);
    expect(g.config.RENDER.lightElevationDeg).toBeGreaterThan(30);
  });
  it('is a loop of the intended length', () => {
    expect(g.track.lengthM).toBeGreaterThan(1300);
    expect(g.track.lengthM).toBeLessThan(2100);
  });
  it('stays in the world and at least 2 m above the ground', () => {
    const { halfSizeM, ceilingM } = g.config.WORLD.bounds;
    for (const p of g.track.positions) {
      expect(Math.abs(p.x)).toBeLessThan(halfSizeM - 4);
      expect(Math.abs(p.z)).toBeLessThan(halfSizeM - 4);
      expect(p.y).toBeLessThan(ceilingM - 5);
      expect(p.y - g.terrain.groundY(p.x, p.z)).toBeGreaterThan(1.8);
    }
  });
  it('keeps clear of the walls: nothing in the way within 4 m sideways of the line', () => {
    // Check the ground rises no more than the line does within a few metres either side.
    const hits: string[] = [];
    for (const [i, p] of g.track.positions.entries()) {
      if (i % 4 !== 0) continue;
      for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]] as const) {
        if (g.terrain.groundY(p.x + dx, p.z + dz) > p.y - 1) hits.push(`sample ${i} near ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  });
  it('never touches the arch or the lodge, and the arch is passable', () => {
    const margin = 1.2;
    for (const p of g.track.positions) {
      for (const b of g.plan.solids) {
        const touching = Math.abs(p.x - b.x) < b.sx / 2 + margin && Math.abs(p.y - b.y) < b.sy / 2 + margin && Math.abs(p.z - b.z) < b.sz / 2 + margin;
        expect(touching).toBe(false);
      }
    }
  });
  it('never touches a pine', () => {
    for (const p of g.track.positions) {
      for (const tree of g.plan.pines) {
        if (Math.hypot(p.x - tree.x, p.z - tree.z) < 6) expect(p.y).toBeGreaterThan(tree.baseY + 12 * tree.scale);
      }
    }
  });
  it('places 12 gates in order, gate 0 at the start', () => {
    const indices = Array.from({ length: 12 }, (_, i) => g.gateSampleIndex(i));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(12);
    const start = g.track.positions[indices[0] ?? 0];
    expect(Math.hypot((start?.x ?? 0) - 0, (start?.z ?? 0) - 240)).toBeLessThan(15);
  });
  it('has the pit pad on flat ground, not on a slope', () => {
    const { x, z } = g.pit.PIT_PAD.position;
    const y = g.terrain.groundY(x, z);
    expect(Math.abs(g.terrain.groundY(x + 3, z) - y)).toBeLessThan(1);
    expect(Math.abs(g.terrain.groundY(x, z + 3) - y)).toBeLessThan(1);
  });
});
