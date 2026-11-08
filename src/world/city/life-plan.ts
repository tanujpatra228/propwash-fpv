/** Where the birds, delivery drones and pedestrians are at any moment. Pure maths on the clock; nothing here is solid. */
import { CITY } from '../../config';
import { createRng, randRange } from '../../core/math';
import { PARK } from './roads';

const L = CITY.life;
const TWO_PI = Math.PI * 2;
const AVENUES = [-240, -120, 0, 120, 240] as const;

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Heading about Y; 0 faces -Z. */
  yawRad: number;
}

export interface BirdSpec {
  isParkFlock: boolean;
  phase: number;
  radiusM: number;
  speed: number;
  heightM: number;
  flapPhase: number;
}

export function buildBirds(): BirdSpec[] {
  const rng = createRng(CITY.seed + 31);
  const birds: BirdSpec[] = [];
  for (let i = 0; i < L.parkBirds + L.towerBirds; i++) {
    const isParkFlock = i < L.parkBirds;
    birds.push({
      isParkFlock,
      phase: rng() * TWO_PI,
      radiusM: isParkFlock ? randRange(rng, 20, 42) : randRange(rng, 90, 160),
      speed: isParkFlock ? randRange(rng, 0.32, 0.42) : randRange(rng, 0.045, 0.07),
      heightM: isParkFlock ? randRange(rng, 24, 40) : randRange(rng, 50, 95),
      flapPhase: rng() * TWO_PI,
    });
  }
  return birds;
}

/** A bird circling the park, or a wanderer weaving between the towers on a slow Lissajous curve. */
export function birdPlacement(b: BirdSpec, timeS: number, out: Placement): Placement {
  const a = b.phase + b.speed * timeS;
  if (b.isParkFlock) {
    out.x = PARK.x + Math.cos(a) * b.radiusM;
    out.z = PARK.z + Math.sin(a) * b.radiusM;
    out.y = b.heightM + Math.sin(a * 3 + b.flapPhase) * 2.5;
    // Moving counter-clockwise on the map: velocity is (-sin, cos).
    out.yawRad = Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI;
  } else {
    out.x = Math.sin(a) * b.radiusM;
    out.z = Math.sin(a * 1.31 + 1.7) * b.radiusM * 0.9;
    out.y = b.heightM + Math.sin(a * 2.3) * 6;
    const vx = Math.cos(a);
    const vz = Math.cos(a * 1.31 + 1.7) * 1.31 * 0.9;
    out.yawRad = Math.atan2(-vx, -vz);
  }
  return out;
}

export interface DeliverySpec {
  alongZ: boolean;
  avenue: number;
  laneOffset: number;
  speedMps: number;
  heightM: number;
  startM: number;
  color: number;
}

export function buildDeliveryDrones(): DeliverySpec[] {
  const rng = createRng(CITY.seed + 99);
  return Array.from({ length: L.deliveryDrones }, (_, i) => ({
    alongZ: i % 2 === 0,
    avenue: AVENUES[(i * 2 + 1) % AVENUES.length] ?? 0,
    laneOffset: i % 3 === 0 ? 4 : -4,
    speedMps: randRange(rng, L.deliveryDroneSpeedMps[0], L.deliveryDroneSpeedMps[1]),
    heightM: randRange(rng, L.deliveryDroneHeightM[0], L.deliveryDroneHeightM[1]),
    startM: rng() * 600,
    color: [0xff7a1a, 0x2ec4ff, 0x7dff5a, 0xff4fa3][i % 4] ?? 0xffffff,
  }));
}

/** Flies up and down an avenue and turns round at the ends (ping-pong), so it never leaves the playable area. */
export function deliveryPlacement(d: DeliverySpec, timeS: number, out: Placement): Placement {
  const span = 560; // ends at +/- 280 m
  const along = (d.startM + d.speedMps * timeS) % (2 * span);
  const goingBack = along > span;
  const coordinate = (goingBack ? 2 * span - along : along) - span / 2;
  const sign = goingBack ? -1 : 1;
  out.x = d.alongZ ? d.avenue + d.laneOffset : coordinate;
  out.z = d.alongZ ? coordinate : d.avenue + d.laneOffset;
  out.y = d.heightM;
  out.yawRad = d.alongZ ? (sign === 1 ? Math.PI : 0) : sign === 1 ? -Math.PI / 2 : Math.PI / 2;
  return out;
}

export interface PedestrianSpec {
  bx: number;
  bz: number;
  startU: number;
  direction: 1 | -1;
  color: number;
}

export function buildPedestrians(): PedestrianSpec[] {
  const rng = createRng(CITY.seed + 5);
  const centers = CITY.blockCentersM;
  const colors = [0xd24a3a, 0x3a6ad2, 0xe6c84a, 0x3aa870, 0xeaeaea, 0x2b2b30, 0xa24ad2];
  return Array.from({ length: L.pedestrians }, () => ({
    bx: centers[Math.floor(rng() * centers.length)] ?? 0,
    bz: centers[Math.floor(rng() * centers.length)] ?? 0,
    startU: rng(),
    direction: rng() < 0.5 ? 1 : -1,
    color: colors[Math.floor(rng() * colors.length)] ?? 0xffffff,
  }));
}

/** Walks the rectangle just inside a block's edge, at walking pace. */
export function pedestrianPlacement(p: PedestrianSpec, timeS: number, out: Placement): Placement {
  const half = CITY.blockHalfM - L.sidewalkInsetM;
  const side = 2 * half;
  const perimeter = 4 * side;
  const s = (((p.startU * perimeter + p.direction * L.walkSpeedMps * timeS) % perimeter) + perimeter) % perimeter;
  const edge = Math.floor(s / side);
  const u = s - edge * side;
  // Corners in order: (-,-) -> (+,-) -> (+,+) -> (-,+).
  const points: ReadonlyArray<readonly [number, number, number, number]> = [
    [-half + u, -half, 1, 0],
    [half, -half + u, 0, 1],
    [half - u, half, -1, 0],
    [-half, half - u, 0, -1],
  ];
  const [ox, oz, dx, dz] = points[edge] ?? points[0] ?? [0, 0, 1, 0];
  out.x = p.bx + ox;
  out.z = p.bz + oz;
  out.y = 0.12;
  const heading = Math.atan2(-dx * p.direction, -dz * p.direction);
  out.yawRad = heading;
  return out;
}
