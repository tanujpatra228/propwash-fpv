import { AUDIO } from '../config';
import { clamp, clamp01 } from '../core/math';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * How much a source's pitch changes for a listener, from the speed of sound and both velocities. Above 1 when the
 * two approach each other, below 1 when they part. Limited so a fast pass cannot squeal.
 */
export function dopplerRatio(listener: Vec3, listenerVelocity: Vec3, source: Vec3, sourceVelocity: Vec3): number {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) return 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const uz = dz / distance;
  const c = AUDIO.remote.speedOfSoundMps;
  // Speeds along the line from the listener to the source: the listener moving toward it, the source moving away.
  const listenerToward = listenerVelocity.x * ux + listenerVelocity.y * uy + listenerVelocity.z * uz;
  const sourceAway = sourceVelocity.x * ux + sourceVelocity.y * uy + sourceVelocity.z * uz;
  const ratio = (c + listenerToward) / Math.max(1, c + sourceAway);
  return clamp(ratio, AUDIO.remote.dopplerMin, AUDIO.remote.dopplerMax);
}

/** What we can guess of a remote drone's throttle from how it moves: more speed and climbing mean harder motors. */
export function remoteThrottle(speedMps: number, climbMps: number): number {
  const r = AUDIO.remote;
  return clamp01(r.throttleBase + r.throttlePerSpeedRatio * clamp01(speedMps / r.fullSpeedMps) + r.throttlePerClimbRatio * clamp01(climbMps / r.fullClimbMps));
}

/** Air absorption: the filter cutoff scale for a distance, 1 up close and falling away. */
export function airAbsorption(distanceM: number): number {
  return 1 / (1 + Math.max(0, distanceM) / AUDIO.remote.absorptionDistanceM);
}

/** Volume of a remote voice at the reference distance, or 0 beyond the range. */
export function remoteVolume(throttle01: number, distanceM: number): number {
  if (distanceM > AUDIO.remote.rangeM) return 0;
  return AUDIO.remote.volumeBase + AUDIO.remote.volumePerThrottle * clamp01(throttle01);
}
