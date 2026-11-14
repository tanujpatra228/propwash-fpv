/** Wind as a field: where it blows, which way and how hard, at any moment. Pure maths on position and the shared clock. */
import { ACTIVE_TRACK_DEF, GLACIER } from '../config';
import { smoothstep } from '../core/math';

export interface WindZone {
  x: number;
  z: number;
  radiusM: number;
  /** Degrees; 0 blows toward -Z (north), 90 toward +X (east). */
  directionDeg: number;
  /** Peak acceleration in m/s². */
  strength: number;
  gustPeriodS: number;
  gustPhase: number;
}

export interface WindAccel {
  x: number;
  y: number;
  z: number;
}

/** How hard the wind blows in `zones` at a point, as an acceleration. Falls to zero at each zone's edge; gusts swing it. */
export function windAcceleration(zones: readonly WindZone[], x: number, z: number, timeS: number, gustMin: number, maxAccel: number, out: WindAccel): WindAccel {
  let ax = 0;
  let az = 0;
  for (const zone of zones) {
    const d = Math.hypot(x - zone.x, z - zone.z);
    if (d >= zone.radiusM) continue;
    const falloff = 1 - smoothstep(zone.radiusM * 0.45, zone.radiusM, d);
    const gust = gustMin + (1 - gustMin) * (0.5 + 0.5 * Math.sin((timeS / zone.gustPeriodS) * Math.PI * 2 + zone.gustPhase));
    const rad = (zone.directionDeg * Math.PI) / 180;
    const push = zone.strength * falloff * gust;
    ax += Math.sin(rad) * push;
    az += -Math.cos(rad) * push;
  }
  const length = Math.hypot(ax, az);
  const scale = length > maxAccel ? maxAccel / length : 1;
  out.x = ax * scale;
  out.y = 0;
  out.z = az * scale;
  return out;
}

/** The zones of the active map: only Glacier Pass has any. */
export const ACTIVE_WIND_ZONES: readonly WindZone[] = ACTIVE_TRACK_DEF.family === 'glacier' ? GLACIER.wind.zones : [];

/** The wind of the active map at a point and time. */
export function windAt(x: number, z: number, timeS: number, out: WindAccel): WindAccel {
  if (ACTIVE_WIND_ZONES.length === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  return windAcceleration(ACTIVE_WIND_ZONES, x, z, timeS, GLACIER.wind.gustMin, GLACIER.wind.maxAccelMps2, out);
}
