import { Vector3 } from 'three';
import { COLLISION } from '../config';
import type { Gate } from '../world/gates';

export interface Pose {
  position: Vector3;
  yawRad: number;
}

/**
 * Where to put the drone after a crash or reset: just past the last passed gate, facing the next one.
 * With no gate passed yet, falls back to `start` (the pad in free flight).
 */
export function respawnPose(
  gates: readonly Gate[],
  lastPassedGate: number,
  start: Pose,
  groundY: (x: number, z: number) => number,
  out: Pose,
): Pose {
  const gate = gates[lastPassedGate];
  const next = gates[(lastPassedGate + 1) % gates.length];
  if (!gate || !next) {
    out.position.copy(start.position);
    out.yawRad = start.yawRad;
    return out;
  }
  out.position.copy(gate.position).addScaledVector(gate.forward, COLLISION.respawnAheadOfGateM);
  out.position.y = Math.max(gate.position.y, groundY(out.position.x, out.position.z) + COLLISION.respawnMinAboveGroundM);
  out.yawRad = Math.atan2(-(next.position.x - out.position.x), -(next.position.z - out.position.z));
  return out;
}
