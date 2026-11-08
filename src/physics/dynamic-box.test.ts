import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ColliderWorld, createHit } from './colliders';

describe('dynamic boxes', () => {
  it('collide where they are now, not where they were', () => {
    const world = new ColliderWorld();
    const car = world.addDynamicBox(new Vector3(2, 1, 1), 'vehicle');
    car.place(10, 1, 0, 0);
    const hit = createHit();
    expect(world.query(new Vector3(10, 1, 0), 0.2, hit)).toBe(true);
    expect(hit.kind).toBe('vehicle');
    expect(world.query(new Vector3(0, 1, 0), 0.2, hit)).toBe(false);
    car.place(0, 1, 0, 0);
    expect(world.query(new Vector3(0, 1, 0), 0.2, hit)).toBe(true);
    expect(world.query(new Vector3(10, 1, 0), 0.2, hit)).toBe(false);
  });
  it('respects rotation about the vertical axis', () => {
    const world = new ColliderWorld();
    const bus = world.addDynamicBox(new Vector3(5, 1.5, 1), 'vehicle'); // long along x
    bus.place(0, 1.5, 0, Math.PI / 2); // now long along z
    const hit = createHit();
    expect(world.query(new Vector3(0, 1.5, 4), 0.2, hit)).toBe(true);
    expect(world.query(new Vector3(4, 1.5, 0), 0.2, hit)).toBe(false);
  });
});
