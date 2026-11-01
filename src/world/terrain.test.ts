import { describe, expect, it } from 'vitest';
import { VALLEY } from '../config';
import { BANDO_FLOOR_Y, groundY, heightAt, LAKE_SURFACE_Y } from './terrain';

describe('terrain', () => {
  it('is deterministic', () => {
    expect(heightAt(100, -50)).toBe(heightAt(100, -50));
    // Golden value: if this changes the world changed, so bump WORLD.version.
    expect(heightAt(100, -50)).toMatchInlineSnapshot(`-1.791306080789311`);
  });

  it('is finite everywhere on the map', () => {
    for (let x = -1300; x <= 1300; x += 260) {
      for (let z = -1300; z <= 1300; z += 260) expect(Number.isFinite(heightAt(x, z))).toBe(true);
    }
  });

  it('puts the water surface above the lake bed', () => {
    const { x, z } = VALLEY.lake;
    expect(heightAt(x, z)).toBeLessThan(LAKE_SURFACE_Y);
    expect(groundY(x, z)).toBe(LAKE_SURFACE_Y);
  });

  it('flattens the factory floor', () => {
    const { x, z } = VALLEY.bando;
    expect(heightAt(x, z)).toBeCloseTo(BANDO_FLOOR_Y, 6);
    expect(heightAt(x + 10, z - 8)).toBeCloseTo(BANDO_FLOOR_Y, 6);
  });

  it('rises into mountains at the edge of the valley', () => {
    expect(heightAt(900, 900)).toBeGreaterThan(heightAt(0, 0) + 40);
  });
});
