import { ROOMS } from '../config';
import type { Gate } from '../world/gates';
import type { Pose } from './respawn';

/**
 * Starting grid for a live race: two columns, rows going back from the start gate, everyone facing it.
 * `slot` 0 is front left, 1 front right, 2 second row left, and so on.
 */
export function gridPose(gate: Gate, slot: number, out: Pose): Pose {
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  const behindM = ROOMS.gridFirstRowBehindM + row * ROOMS.gridRowSpacingM;
  // Sideways is perpendicular to the gate's forward direction, in the ground plane.
  out.position.copy(gate.position).addScaledVector(gate.forward, -behindM);
  out.position.x += -gate.forward.z * side * ROOMS.gridColumnOffsetM;
  out.position.z += gate.forward.x * side * ROOMS.gridColumnOffsetM;
  out.yawRad = Math.atan2(-gate.forward.x, -gate.forward.z);
  return out;
}
