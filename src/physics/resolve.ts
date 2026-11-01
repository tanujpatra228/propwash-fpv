import type { Vector3 } from 'three';
import { COLLISION } from '../config';
import { clamp } from '../core/math';
import { createHit, type ColliderKind, type ColliderWorld } from './colliders';

/** Why a drone crashed. The game layer turns these into player-facing text. */
export type CrashReason = 'ground' | 'water' | ColliderKind;

export interface CollisionResult {
  crashed: boolean;
  reason: CrashReason | null;
}

/** The part of a drone that collision rules need. FlightModel satisfies this. */
export interface Body {
  position: Vector3;
  velocity: Vector3;
}

/** What is below a point. Injected so physics/ does not depend on world/. */
export interface SurfaceQuery {
  (x: number, z: number, out: { y: number; isWater: boolean }): { y: number; isWater: boolean };
}

const hit = createHit();
const surface = { y: 0, isWater: false };
const result: CollisionResult = { crashed: false, reason: null };
const MAX_PUSH_OUT_ITERATIONS = 3;

function crash(reason: CrashReason): CollisionResult {
  result.crashed = true;
  result.reason = reason;
  return result;
}

/** How many sub-steps keep each move under COLLISION.maxStepM (fast drones cannot tunnel through bars). */
export function substepCount(speedMps: number, dtS: number): number {
  return clamp(Math.ceil((speedMps * dtS) / COLLISION.maxStepM), 1, COLLISION.maxSubsteps);
}

/**
 * Applies ground, water and obstacle rules after a movement step.
 * Returns a shared result object (valid until the next call).
 */
export function resolveDrone(body: Body, world: ColliderWorld, surfaceAt: SurfaceQuery, dtS: number): CollisionResult {
  result.crashed = false;
  result.reason = null;
  const { position, velocity } = body;

  surfaceAt(position.x, position.z, surface);
  if (surface.isWater) {
    if (position.y < surface.y + COLLISION.waterContactM) return crash('water');
  } else {
    const floorY = surface.y + COLLISION.restOffsetM;
    if (position.y < floorY) {
      if (velocity.length() > COLLISION.groundCrashSpeedMps) return crash('ground');
      position.y = floorY;
      if (velocity.y < 0) velocity.y = 0;
      const keep = COLLISION.groundSlideKeepPer60Hz ** (dtS * 60);
      velocity.x *= keep;
      velocity.z *= keep;
    }
  }

  for (let i = 0; i < MAX_PUSH_OUT_ITERATIONS; i++) {
    if (!world.query(position, COLLISION.droneRadiusM, hit)) break;
    if (velocity.length() > COLLISION.obstacleCrashSpeedMps) return crash(hit.kind);
    position.addScaledVector(hit.normal, hit.depth);
    const intoSurface = velocity.dot(hit.normal);
    if (intoSurface < 0) velocity.addScaledVector(hit.normal, -intoSurface * (1 + COLLISION.bumpRestitution));
  }
  return result;
}
