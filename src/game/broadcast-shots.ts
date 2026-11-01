import { Vector3 } from 'three';
import { MENU } from '../config';

export type ShotKind = 'chase' | 'side' | 'trackside';
export const SHOT_ORDER: readonly ShotKind[] = ['chase', 'side', 'trackside'];

const CHASE_HEIGHT_M = 2.2;
const SIDE_HEIGHT_M = 2;
const TRACKSIDE_SIDE_M = 8;

/**
 * Camera for one TV-style shot of a racer. `forward` is the racer's horizontal unit direction and
 * `aheadPoint` is a point on the racing line further along (for the fixed trackside shot). Pure.
 */
export function broadcastShot(
  kind: ShotKind,
  subject: Vector3,
  forward: Vector3,
  aheadPoint: Vector3,
  outPosition: Vector3,
  outLookAt: Vector3,
): void {
  outLookAt.copy(subject);
  if (kind === 'chase') {
    outPosition.copy(subject).addScaledVector(forward, -MENU.shots.chaseBehindM);
    outPosition.y += CHASE_HEIGHT_M;
  } else if (kind === 'side') {
    outPosition.set(subject.x + forward.z * MENU.shots.sideOutM, subject.y + SIDE_HEIGHT_M, subject.z - forward.x * MENU.shots.sideOutM);
  } else {
    outPosition.set(aheadPoint.x + forward.z * TRACKSIDE_SIDE_M, aheadPoint.y + MENU.shots.trackside.heightM, aheadPoint.z - forward.x * TRACKSIDE_SIDE_M);
  }
}
