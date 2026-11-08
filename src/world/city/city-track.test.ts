import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** These tests need the city to be the active track, which is decided when `config.ts` is first loaded. */
async function loadCity(track = 'city') {
  vi.resetModules();
  vi.stubGlobal('location', { search: `?track=${track}` });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const config = await import('../../config');
  const trackModule = await import('../track');
  const plan = await import('./plan');
  return { config, track: trackModule.track, gateSampleIndex: trackModule.gateSampleIndex, plan: plan.buildCityPlan() };
}

describe('Downtown Dash track', () => {
  let city: Awaited<ReturnType<typeof loadCity>>;
  beforeAll(async () => {
    city = await loadCity();
  });
  afterEach(() => undefined);

  it('is the active track with its own bounds and version', () => {
    expect(city.config.ACTIVE_TRACK_ID).toBe('city');
    expect(city.config.WORLD.bounds.halfSizeM).toBe(320);
    expect(city.config.WORLD.version).toBe(101);
  });
  it('is a loop of the intended length', () => {
    expect(city.track.lengthM).toBeGreaterThan(1300);
    expect(city.track.lengthM).toBeLessThan(1900);
  });
  it('stays inside the world', () => {
    const { halfSizeM, ceilingM } = city.config.WORLD.bounds;
    for (const p of city.track.positions) {
      expect(Math.abs(p.x)).toBeLessThan(halfSizeM - 4);
      expect(Math.abs(p.z)).toBeLessThan(halfSizeM - 4);
      expect(p.y).toBeLessThan(ceilingM - 5);
      expect(p.y).toBeGreaterThan(1.5);
    }
  });
  it('never touches a building (1.2 m margin), except it passes through the portals', () => {
    const margin = 1.2;
    const hits: string[] = [];
    for (const [i, p] of city.track.positions.entries()) {
      for (const b of city.plan.buildings) {
        for (const box of b.boxes) {
          if (Math.abs(p.x - box.x) < box.sx / 2 + margin && Math.abs(p.y - box.y) < box.sy / 2 + margin && Math.abs(p.z - box.z) < box.sz / 2 + margin) {
            hits.push(`sample ${i} at ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)} hits ${b.kind} at ${box.x.toFixed(0)},${box.z.toFixed(0)}`);
          }
        }
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  });
  it('places 12 gates in order along the line, gate 0 near the start', () => {
    const indices = Array.from({ length: city.config.TRACK.gateCount }, (_, i) => city.gateSampleIndex(i));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(12);
    const start = city.track.positions[indices[0] ?? 0];
    expect(Math.hypot((start?.x ?? 0) - 0, (start?.z ?? 0) - 190)).toBeLessThan(12);
  });
});

describe('Downtown Dash: Night', () => {
  it('is the same city and line in a night atmosphere with its own world version', async () => {
    const day = await loadCity('city');
    const night = await loadCity('night');
    expect(night.config.ACTIVE_TRACK_ID).toBe('night');
    expect(night.config.RENDER.isNight).toBe(true);
    expect(day.config.RENDER.isNight).toBe(false);
    expect(night.config.WORLD.version).toBe(102);
    expect(night.config.WORLD.version).not.toBe(day.config.WORLD.version);
    expect(night.track.lengthM).toBeCloseTo(day.track.lengthM, 3);
    expect(JSON.stringify(night.plan)).toBe(JSON.stringify(day.plan));
  });
  it('is dim but readable: lit by a moon, with a night sky and fog', async () => {
    const { config } = await loadCity('night');
    expect(config.RENDER.hasStars).toBe(true);
    expect(config.RENDER.lightElevationDeg).toBeGreaterThan(0);
    expect(config.RENDER.sunElevationDeg).toBeLessThan(0);
    expect(config.RENDER.hemisphereIntensity).toBeGreaterThan(0.3);
  });
});
