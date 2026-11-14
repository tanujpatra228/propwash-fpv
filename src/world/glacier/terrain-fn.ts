/**
 * Glacier Pass's ground as a pure function of position: mountains everywhere, with the race route carved through them.
 * The mesh, the physics and the track all call this one function, so they always agree.
 */
import { GLACIER } from '../../config';
import { fbm, lerp, smoothstep } from '../../core/math';

export interface RouteInfo {
  /** Distance from the point to the route line, in metres. */
  distanceM: number;
  floorY: number;
  halfWidthM: number;
}

const POINTS = GLACIER.route;
const COUNT = POINTS.length;

/** The closest point on the closed route polyline, with the floor height and width interpolated along the segment. */
export function routeInfo(x: number, z: number, out: RouteInfo): RouteInfo {
  let best = Infinity;
  for (let i = 0; i < COUNT; i++) {
    const a = POINTS[i];
    const b = POINTS[(i + 1) % COUNT];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
    const px = a[0] + dx * t - x;
    const pz = a[1] + dz * t - z;
    const distSq = px * px + pz * pz;
    if (distSq < best) {
      best = distSq;
      out.floorY = lerp(a[2], b[2], t);
      out.halfWidthM = lerp(a[3], b[3], t);
    }
  }
  out.distanceM = Math.sqrt(best);
  return out;
}

/** The mountains before the route is carved: tall everywhere, taller toward the edge of the world. */
export function mountainHeight(x: number, z: number): number {
  const m = GLACIER.mountain;
  const n = fbm(x * 0.0045 + 7, z * 0.0045 - 3, 5);
  const ridge = 1 - Math.abs(fbm(x * 0.009 - 11, z * 0.009 + 5, 3) * 2 - 1);
  const edge = smoothstep(m.edgeStartM, m.edgeEndM, Math.hypot(x, z));
  return m.baseM + m.noiseM * (0.55 * n + 0.45 * ridge * ridge) + m.edgeM * edge;
}

const scratch: RouteInfo = { distanceM: 0, floorY: 0, halfWidthM: 0 };

/** Ground height at a point. Deterministic. */
export function glacierHeight(x: number, z: number): number {
  routeInfo(x, z, scratch);
  const transition = GLACIER.wallTransitionM + scratch.halfWidthM * 0.5;
  const carve = 1 - smoothstep(scratch.halfWidthM, scratch.halfWidthM + transition, scratch.distanceM);
  const floor = scratch.floorY + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.2;
  return lerp(mountainHeight(x, z), floor, carve);
}

/** True on the frozen lake: the wide, low part of the carved floor. */
export function isIce(x: number, z: number): boolean {
  routeInfo(x, z, scratch);
  return scratch.halfWidthM >= GLACIER.lake.minHalfWidthM && scratch.floorY <= GLACIER.lake.maxFloorM && scratch.distanceM < scratch.halfWidthM;
}
