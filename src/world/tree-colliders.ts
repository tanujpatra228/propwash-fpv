import { SCENERY } from '../config';
import type { ColliderWorld } from '../physics/colliders';

export type TreeKind = keyof typeof SCENERY.treeColliders;

/**
 * Registers a tree's trunk and leafy parts as stacked cylinders, so the green parts are solid too.
 * `footY` is the trunk's foot; `scaleXZ` and `scaleY` match the instance's scale.
 */
export function addTreeColliders(
  world: ColliderWorld,
  kind: TreeKind,
  x: number,
  z: number,
  footY: number,
  scaleXZ: number,
  scaleY: number,
): void {
  for (const [baseM, heightM, radiusM] of SCENERY.treeColliders[kind]) {
    world.addCylinder(x, z, footY + baseM * scaleY, heightM * scaleY, radiusM * scaleXZ, 'tree');
  }
}
