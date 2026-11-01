import { Vector3 } from 'three';
import { GATE } from '../config';

/** The plane and opening of one gate. Pure data, shared by gate meshes, lap logic and tests. */
export interface GatePlane {
  /** Centre of the opening. */
  position: Vector3;
  /** Horizontal unit vector along the track (the way you fly through). */
  forward: Vector3;
  /** Horizontal unit vector across the gate. */
  right: Vector3;
}

export function createGatePlane(position: Vector3, forward: Vector3): GatePlane {
  const f = new Vector3(forward.x, 0, forward.z).normalize();
  return { position: position.clone(), forward: f, right: new Vector3(f.z, 0, -f.x) };
}

const HALF_OPENING_X = (GATE.widthM - GATE.frameThicknessM) / 2;
const HALF_OPENING_Y = (GATE.heightM - GATE.frameThicknessM) / 2;

/**
 * True when the segment prev -> pos goes through the gate's opening, front to back.
 * Uses the whole segment, so a fast drone cannot skip a gate between two frames.
 */
export function checkGateCrossing(gate: GatePlane, prev: Vector3, pos: Vector3): boolean {
  const prevZ = (prev.x - gate.position.x) * gate.forward.x + (prev.z - gate.position.z) * gate.forward.z;
  const posZ = (pos.x - gate.position.x) * gate.forward.x + (pos.z - gate.position.z) * gate.forward.z;
  if (!(prevZ < 0 && posZ >= 0)) return false;
  const t = -prevZ / (posZ - prevZ);
  const x = prev.x + (pos.x - prev.x) * t - gate.position.x;
  const y = prev.y + (pos.y - prev.y) * t - gate.position.y;
  const z = prev.z + (pos.z - prev.z) * t - gate.position.z;
  const across = x * gate.right.x + z * gate.right.z;
  return Math.abs(across) < HALF_OPENING_X && Math.abs(y) < HALF_OPENING_Y;
}
