import { describe, expect, it } from 'vitest';
import { clampToScreenEdge } from './gate-marker';

describe('clampToScreenEdge', () => {
  it('leaves an on-screen gate where it is', () => {
    expect(clampToScreenEdge(0.3, -0.4, false)).toEqual({ x: 0.3, y: -0.4 });
  });

  it('pushes an off-screen gate to the edge along the same direction', () => {
    const p = clampToScreenEdge(2, 1, false, 0.9);
    expect(p.x).toBeCloseTo(0.9);
    expect(p.y).toBeCloseTo(0.45);
  });

  it('flips a gate behind the camera so the arrow points toward it', () => {
    const p = clampToScreenEdge(0.2, 0.1, true, 0.9);
    expect(p.x).toBeLessThan(0);
    expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeCloseTo(0.9);
  });

  it('handles a gate dead behind (zero offset) without NaN', () => {
    const p = clampToScreenEdge(0, 0, true);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
