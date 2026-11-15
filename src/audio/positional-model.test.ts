import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config';
import { airAbsorption, dopplerRatio, remoteThrottle, remoteVolume } from './positional-model';

const at = (x: number, y = 0, z = 0) => ({ x, y, z });
const still = at(0);

describe('dopplerRatio', () => {
  it('is 1 when nothing moves, or when they are at the same spot', () => {
    expect(dopplerRatio(still, still, at(50), still)).toBe(1);
    expect(dopplerRatio(still, still, still, at(10))).toBe(1);
  });
  it('rises when the source comes toward you and falls when it flies away', () => {
    expect(dopplerRatio(still, still, at(100), at(-30))).toBeGreaterThan(1);
    expect(dopplerRatio(still, still, at(100), at(30))).toBeLessThan(1);
  });
  it('matches the physics: 30 m/s toward you is about +9.6%', () => {
    expect(dopplerRatio(still, still, at(100), at(-30))).toBeCloseTo(343 / (343 - 30), 4);
  });
  it('rises when you fly toward a still source, and ignores sideways motion', () => {
    expect(dopplerRatio(still, at(30), at(100), still)).toBeGreaterThan(1);
    expect(dopplerRatio(still, at(0, 0, 30), at(100), still)).toBe(1);
    expect(dopplerRatio(still, still, at(100), at(0, 0, 40))).toBe(1);
  });
  it('is limited so a very fast pass cannot squeal', () => {
    expect(dopplerRatio(still, still, at(100), at(-300))).toBe(AUDIO.remote.dopplerMax);
    expect(dopplerRatio(still, at(300), at(100), still)).toBe(AUDIO.remote.dopplerMax);
    expect(dopplerRatio(still, at(-300), at(100), still)).toBe(AUDIO.remote.dopplerMin);
  });
});

describe('remote voice helpers', () => {
  it('estimates harder motors for a faster or climbing drone, within 0..1', () => {
    expect(remoteThrottle(0, 0)).toBe(AUDIO.remote.throttleBase);
    expect(remoteThrottle(20, 0)).toBeGreaterThan(remoteThrottle(5, 0));
    expect(remoteThrottle(0, 6)).toBeGreaterThan(remoteThrottle(0, 0));
    expect(remoteThrottle(500, 500)).toBeCloseTo(1);
    expect(remoteThrottle(0, -5)).toBe(AUDIO.remote.throttleBase);
  });
  it('takes the highs off with distance', () => {
    expect(airAbsorption(0)).toBe(1);
    expect(airAbsorption(60)).toBeCloseTo(0.5);
    expect(airAbsorption(200)).toBeLessThan(airAbsorption(50));
  });
  it('is louder for harder motors and silent beyond the range', () => {
    expect(remoteVolume(1, 10)).toBeGreaterThan(remoteVolume(0, 10));
    expect(remoteVolume(1, AUDIO.remote.rangeM)).toBeGreaterThan(0);
    expect(remoteVolume(1, AUDIO.remote.rangeM + 1)).toBe(0);
  });
});
