import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../config';
import { clampToWorld, isWellInsideWorld } from './bounds';

const { halfSizeM, ceilingM } = WORLD.bounds;
const body = (p: [number, number, number], v: [number, number, number] = [0, 0, 0]) => ({ position: new Vector3(...p), velocity: new Vector3(...v) });

describe('clampToWorld', () => {
  it('leaves a drone inside the world alone', () => {
    const b = body([10, 20, -30], [5, 1, 2]);
    expect(clampToWorld(b)).toBe(false);
    expect(b.position.toArray()).toEqual([10, 20, -30]);
    expect(b.velocity.toArray()).toEqual([5, 1, 2]);
  });

  it('stops the drone at each wall and removes the outward speed only', () => {
    const east = body([halfSizeM + 5, 10, 0], [20, 0, 7]);
    expect(clampToWorld(east)).toBe(true);
    expect(east.position.x).toBe(halfSizeM);
    expect(east.velocity.toArray()).toEqual([0, 0, 7]); // can still slide along the wall

    const north = body([0, 10, -halfSizeM - 1], [0, 0, -9]);
    clampToWorld(north);
    expect(north.position.z).toBe(-halfSizeM);
    expect(north.velocity.z).toBe(0);
  });

  it('keeps inward speed so the drone can fly back out', () => {
    const b = body([halfSizeM + 1, 10, 0], [-8, 0, 0]);
    clampToWorld(b);
    expect(b.velocity.x).toBe(-8);
  });

  it('has a ceiling but no floor of its own (the terrain is the floor)', () => {
    const up = body([0, ceilingM + 10, 0], [0, 5, 0]);
    expect(clampToWorld(up)).toBe(true);
    expect(up.position.y).toBe(ceilingM);
    expect(up.velocity.y).toBe(0);
    const down = body([0, -500, 0], [0, -5, 0]);
    expect(clampToWorld(down)).toBe(false);
  });

  it('handles a corner', () => {
    const b = body([halfSizeM + 3, 10, halfSizeM + 3], [10, 0, 10]);
    clampToWorld(b);
    expect(b.position.x).toBe(halfSizeM);
    expect(b.position.z).toBe(halfSizeM);
  });
});

describe('isWellInsideWorld', () => {
  it('uses a margin', () => {
    expect(isWellInsideWorld(new Vector3(0, 10, 0), 50)).toBe(true);
    expect(isWellInsideWorld(new Vector3(halfSizeM - 10, 10, 0), 50)).toBe(false);
  });
});
