import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ColliderWorld, createHit } from '../physics/colliders';
import { addTreeColliders } from './tree-colliders';

const R = 0.18;
const hits = (world: ColliderWorld, x: number, y: number, z: number): boolean => world.query(new Vector3(x, y, z), R, createHit());

describe('tree colliders', () => {
  const pine = new ColliderWorld();
  addTreeColliders(pine, 'pine', 0, 0, 0, 1, 1);

  it('makes the pine foliage solid, not only the trunk', () => {
    expect(hits(pine, 0.3, 1, 0)).toBe(true); // trunk
    expect(hits(pine, 1.9, 3.5, 0)).toBe(true); // lowest tier, out in the needles
    expect(hits(pine, 1.2, 6, 0)).toBe(true); // middle tier
    expect(hits(pine, 0.6, 9, 0)).toBe(true); // top tier
  });

  it('lets a drone pass beside and above the tree', () => {
    expect(hits(pine, 3.5, 3.5, 0)).toBe(false);
    expect(hits(pine, 0, 12, 0)).toBe(false);
    expect(hits(pine, 1.8, 9, 0)).toBe(false); // top tier is narrower than the bottom one
  });

  it('follows the pine shape: wide at the bottom, narrow at the top', () => {
    expect(hits(pine, 1.9, 3.5, 0)).toBe(true);
    expect(hits(pine, 1.9, 9, 0)).toBe(false);
  });

  it('scales with the tree', () => {
    const big = new ColliderWorld();
    addTreeColliders(big, 'pine', 0, 0, 5, 2, 1.5);
    expect(hits(big, 3.9, 5 + 2.1 * 1.5 + 1, 0)).toBe(true);
    expect(hits(big, 3.9, 1, 0)).toBe(false); // below the tree's foot
  });

  it('makes a broadleaf crown solid', () => {
    const tree = new ColliderWorld();
    addTreeColliders(tree, 'broadleaf', 10, 10, 0, 1, 1);
    expect(hits(tree, 12.2, 4.5, 10)).toBe(true);
    expect(hits(tree, 14, 4.5, 10)).toBe(false);
    expect(hits(tree, 10, 9, 10)).toBe(false);
  });
});
