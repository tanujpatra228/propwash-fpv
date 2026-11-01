import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ColliderWorld } from './colliders';
import { resolveDrone, substepCount, type Body, type SurfaceQuery } from './resolve';

const flatGround: SurfaceQuery = (_x, _z, out) => {
  out.y = 0;
  out.isWater = false;
  return out;
};
const lake: SurfaceQuery = (_x, _z, out) => {
  out.y = 0;
  out.isWater = true;
  return out;
};

function body(position: [number, number, number], velocity: [number, number, number] = [0, 0, 0]): Body {
  return { position: new Vector3(...position), velocity: new Vector3(...velocity) };
}

function wallWorld(): ColliderWorld {
  const world = new ColliderWorld();
  // A wall 1 m thick whose face is at x = 0 and which extends to x = -1.
  world.addBox(new Matrix4().makeTranslation(-0.5, 5, 0), new Vector3(0.5, 5, 5), 'factory');
  return world;
}

describe('resolveDrone: ground', () => {
  const none = new ColliderWorld();

  it('lets a gentle landing rest on the ground', () => {
    const b = body([0, 0.05, 0], [1, -3, 0]);
    const r = resolveDrone(b, none, flatGround, 1 / 60);
    expect(r.crashed).toBe(false);
    expect(b.position.y).toBeCloseTo(0.1);
    expect(b.velocity.y).toBe(0);
    expect(b.velocity.x).toBeLessThan(1);
  });

  it('crashes on a fast ground hit', () => {
    const r = resolveDrone(body([0, 0.05, 0], [10, -9, 0]), none, flatGround, 1 / 60);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('ground');
  });

  it('does nothing in the air', () => {
    const b = body([0, 20, 0], [20, 0, 0]);
    expect(resolveDrone(b, none, flatGround, 1 / 60).crashed).toBe(false);
    expect(b.position.y).toBe(20);
  });

  it('slides to a stop on the ground at the same rate regardless of frame rate', () => {
    const slide = (dt: number, frames: number): number => {
      const b = body([0, 0.1, 0], [5, 0, 0]);
      for (let i = 0; i < frames; i++) resolveDrone(b, none, flatGround, dt);
      return b.velocity.x;
    };
    expect(slide(1 / 60, 60)).toBeCloseTo(slide(1 / 30, 30), 3);
  });
});

describe('resolveDrone: water', () => {
  const none = new ColliderWorld();

  it('crashes on touching the lake, even slowly', () => {
    const r = resolveDrone(body([0, 0.01, 0], [0, -0.5, 0]), none, lake, 1 / 60);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('water');
  });

  it('allows a low pass just above the surface', () => {
    expect(resolveDrone(body([0, 0.3, 0], [20, 0, 0]), none, lake, 1 / 60).crashed).toBe(false);
  });
});

describe('resolveDrone: obstacles', () => {
  it('crashes into a wall at speed with the wall kind as the reason', () => {
    const r = resolveDrone(body([0.1, 5, 0], [-12, 0, 0]), wallWorld(), flatGround, 1 / 60);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('factory');
  });

  it('bumps off a wall at walking pace, pushed out of the surface', () => {
    const b = body([0.1, 5, 0], [-2, 0, 0]);
    const r = resolveDrone(b, wallWorld(), flatGround, 1 / 60);
    expect(r.crashed).toBe(false);
    expect(b.position.x).toBeGreaterThanOrEqual(0.18 - 1e-6);
    expect(b.velocity.x).toBeGreaterThanOrEqual(0); // bounced away
  });

  it('crashes into a tree trunk', () => {
    const world = new ColliderWorld();
    world.addCylinder(0, 0, 0, 10, 0.5, 'tree');
    const r = resolveDrone(body([0.55, 3, 0], [-15, 0, 0]), world, flatGround, 1 / 60);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('tree');
  });

  it('flies past an obstacle without touching it', () => {
    const r = resolveDrone(body([5, 5, 0], [-12, 0, 0]), wallWorld(), flatGround, 1 / 60);
    expect(r.crashed).toBe(false);
  });
});

describe('substepCount', () => {
  it('uses one step when slow and more when fast, capped', () => {
    expect(substepCount(1, 1 / 60)).toBe(1);
    expect(substepCount(28, 1 / 60)).toBe(2);
    expect(substepCount(28, 0.05)).toBe(6);
    expect(substepCount(500, 0.05)).toBe(8);
  });
});
