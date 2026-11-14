import { Euler, type Quaternion, type Vector3 } from 'three';
import type { PoseFields } from '../../core/room-protocol';

const euler = new Euler(0, 0, 0, 'YXZ');
const cm = (m: number): number => Math.round(m * 100);
const rad100 = (r: number): number => Math.round(r * 100);

/** Writes a drone's pose as the whole numbers the room protocol sends: centimetres and hundredths of a radian. */
export function quantisePose(position: Vector3, quaternion: Quaternion, out: PoseFields): PoseFields {
  euler.setFromQuaternion(quaternion, 'YXZ');
  out.x = cm(position.x);
  out.y = cm(position.y);
  out.z = cm(position.z);
  out.yaw = rad100(euler.y);
  out.pitch = rad100(euler.x);
  out.roll = rad100(euler.z);
  return out;
}
