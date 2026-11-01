import { describe, expect, it } from 'vitest';
import { clamp, createRng, damp, fbm, hash2, lerp, smoothstep, valueNoise } from './math';

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('lerps and smoothsteps', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });

  it('damp with dt 0 does not move', () => {
    expect(damp(3, 10, 5, 0)).toBe(3);
  });

  it('noise is deterministic and bounded', () => {
    expect(hash2(12, -7)).toBe(hash2(12, -7));
    expect(fbm(10.3, 4.2)).toBe(fbm(10.3, 4.2));
    for (let i = 0; i < 500; i++) {
      const n = valueNoise(i * 0.37, i * 0.11);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('seeded rng repeats and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});
