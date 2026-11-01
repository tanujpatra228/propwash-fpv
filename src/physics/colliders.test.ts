import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ColliderWorld, createHit } from './colliders';

function unitBoxWorld(): ColliderWorld {
  const world = new ColliderWorld();
  world.addBox(new Matrix4(), new Vector3(0.5, 0.5, 0.5), 'gate');
  return world;
}

describe('ColliderWorld boxes', () => {
  it('hits a point inside a unit box with positive depth', () => {
    const hit = createHit();
    expect(unitBoxWorld().query(new Vector3(0, 0, 0), 0.18, hit)).toBe(true);
    expect(hit.depth).toBeGreaterThan(0);
    expect(hit.kind).toBe('gate');
  });

  it('misses a point 1 m outside', () => {
    expect(unitBoxWorld().query(new Vector3(1.5, 0, 0), 0.18, createHit())).toBe(false);
  });

  it('reports a normal pointing out of the surface', () => {
    const hit = createHit();
    expect(unitBoxWorld().query(new Vector3(0.6, 0, 0), 0.18, hit)).toBe(true);
    expect(hit.normal.x).toBeCloseTo(1);
    expect(hit.depth).toBeCloseTo(0.08);
  });

  it('respects rotation and translation', () => {
    const world = new ColliderWorld();
    const matrix = new Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 0, 0);
    world.addBox(matrix, new Vector3(2, 0.5, 0.5), 'factory'); // long axis ends up along Z
    expect(world.query(new Vector3(10, 0, 1.8), 0.18, createHit())).toBe(true);
    expect(world.query(new Vector3(11.8, 0, 0), 0.18, createHit())).toBe(false);
  });

  it('respects scale', () => {
    const world = new ColliderWorld();
    world.addBox(new Matrix4().makeScale(4, 1, 1), new Vector3(0.5, 0.5, 0.5), 'container');
    expect(world.query(new Vector3(1.9, 0, 0), 0.1, createHit())).toBe(true);
    expect(world.query(new Vector3(2.3, 0, 0), 0.1, createHit())).toBe(false);
  });
});

describe('ColliderWorld cylinders', () => {
  it('hits a tree trunk and ignores the space above it', () => {
    const world = new ColliderWorld();
    world.addCylinder(5, 5, 0, 10, 0.5, 'tree');
    const hit = createHit();
    expect(world.query(new Vector3(5.3, 3, 5), 0.18, hit)).toBe(true);
    expect(hit.kind).toBe('tree');
    expect(hit.normal.x).toBeGreaterThan(0.9);
    expect(world.query(new Vector3(5.3, 12, 5), 0.18, createHit())).toBe(false);
    expect(world.query(new Vector3(8, 3, 5), 0.18, createHit())).toBe(false);
  });

  it('finds trees across a grid cell border', () => {
    const world = new ColliderWorld();
    world.addCylinder(16, 0, 0, 10, 0.5, 'tree'); // sits on the cell edge
    expect(world.query(new Vector3(15.7, 2, 0), 0.18, createHit())).toBe(true);
    expect(world.query(new Vector3(16.3, 2, 0), 0.18, createHit())).toBe(true);
  });
});
