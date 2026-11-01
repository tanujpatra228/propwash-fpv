import type { Vector3 } from 'three';
import { WORLD } from '../config';
import type { Body } from './resolve';

const { halfSizeM, ceilingM } = WORLD.bounds;

/**
 * Keeps the drone inside the world box: stops it at the wall and removes the speed pointing out of it.
 * Not a crash: the player just cannot leave. Returns true when a wall was touched.
 */
export function clampToWorld(body: Body): boolean {
  let isTouching = false;
  const { position, velocity } = body;
  const limit = (axis: 'x' | 'y' | 'z', max: number, min = -max): void => {
    if (position[axis] > max) {
      position[axis] = max;
      if (velocity[axis] > 0) velocity[axis] = 0;
      isTouching = true;
    } else if (position[axis] < min) {
      position[axis] = min;
      if (velocity[axis] < 0) velocity[axis] = 0;
      isTouching = true;
    }
  };
  limit('x', halfSizeM);
  limit('z', halfSizeM);
  limit('y', ceilingM, Number.NEGATIVE_INFINITY);
  return isTouching;
}

/** Inside the box with at least `marginM` to spare on every side. */
export function isWellInsideWorld(position: Vector3, marginM: number): boolean {
  return Math.abs(position.x) < halfSizeM - marginM && Math.abs(position.z) < halfSizeM - marginM && position.y < ceilingM - marginM;
}
