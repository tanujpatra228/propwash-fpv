import { describe, expect, it } from 'vitest';
import { ROOMS } from '../config';
import { tagOpacity } from './hud-bridge';

describe('tagOpacity', () => {
  it('is fully opaque up close and fades to the far opacity', () => {
    expect(tagOpacity(5)).toBe(1);
    expect(tagOpacity(ROOMS.tagNearM)).toBe(1);
    expect(tagOpacity(ROOMS.tagFarM)).toBeCloseTo(ROOMS.tagFarOpacity);
    expect(tagOpacity(5000)).toBeCloseTo(ROOMS.tagFarOpacity);
  });
  it('fades steadily in between', () => {
    const mid = tagOpacity((ROOMS.tagNearM + ROOMS.tagFarM) / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(ROOMS.tagFarOpacity);
  });
});
