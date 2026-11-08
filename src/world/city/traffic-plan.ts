/**
 * Where every vehicle is at any moment. Pure and deterministic: no scene, no state, just maths on the clock.
 *
 * Each axis of avenues moves one whole block (120 m) during its 18 s of green, eased in and out so vehicles pull away
 * and brake, then waits through the other axis's green. Because every move is exactly one block, stopped vehicles
 * always rest in the same places between junctions, and cross traffic never meets in an intersection.
 */
import { CITY } from '../../config';
import { clamp01, createRng, randRange } from '../../core/math';

const T = CITY.traffic;
export type VehicleType = keyof typeof T.types;
const AVENUES = [-240, -120, 0, 120, 240] as const;

export interface Vehicle {
  type: VehicleType;
  /** True when the lane runs along Z (an avenue at constant X). */
  alongZ: boolean;
  /** The avenue's centre line and which of its two lanes. */
  avenue: number;
  direction: 1 | -1;
  /** Distance along the lane at rest at the start of the cycle, from the lane's start. */
  startM: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  color: number;
}

export interface VehiclePose {
  x: number;
  z: number;
  yawRad: number;
  /** Speed along the lane, m/s, for tilting or effects. */
  speedMps: number;
}

function pickType(roll: number): VehicleType {
  const { car, van } = T.types;
  return roll < car.weight ? 'car' : roll < car.weight + van.weight ? 'van' : 'bus';
}

/** Lays out the traffic: a vehicle or two in each block of each lane, evenly random, never overlapping. */
export function buildTraffic(): Vehicle[] {
  const rng = createRng(CITY.seed + 777);
  const vehicles: Vehicle[] = [];
  const blocks = T.laneLengthM / T.blockM;
  for (const alongZ of [true, false]) {
    for (const avenue of AVENUES) {
      for (const direction of [1, -1] as const) {
        for (let block = 0; block < blocks; block++) {
          const count = rng() < 0.55 ? T.vehiclesPerBlockLane[1] : T.vehiclesPerBlockLane[0];
          const placed: Array<{ u: number; half: number }> = [];
          for (let k = 0; k < count; k++) {
            const type = pickType(rng());
            const spec = T.types[type];
            const half = spec.lengthM / 2;
            for (let attempt = 0; attempt < 12; attempt++) {
              const u = randRange(rng, T.restMinM + half, T.restMaxM - half);
              if (placed.every((p) => Math.abs(p.u - u) >= p.half + half + T.minGapM)) {
                placed.push({ u, half });
                const color = T.colors[Math.floor(rng() * T.colors.length)] ?? 0xffffff;
                vehicles.push({ type, alongZ, avenue, direction, startM: block * T.blockM + u, lengthM: spec.lengthM, widthM: spec.widthM, heightM: spec.heightM, color });
                break;
              }
            }
          }
        }
      }
    }
  }
  return vehicles;
}

const ease = (x: number): number => x * x * (3 - 2 * x);

/** How many blocks an axis has moved by time `timeS` (a fraction while moving). Axis B runs half a cycle after axis A. */
export function blocksTravelled(alongZ: boolean, timeS: number): number {
  const shifted = timeS - (alongZ ? 0 : T.cycleS / 2);
  const cycle = Math.floor(shifted / T.cycleS);
  const inCycle = shifted - cycle * T.cycleS;
  return cycle + ease(clamp01(inCycle / T.greenS));
}

/** Speed in m/s along the lane at `timeS`. */
function laneSpeed(alongZ: boolean, timeS: number): number {
  const shifted = timeS - (alongZ ? 0 : T.cycleS / 2);
  const inCycle = shifted - Math.floor(shifted / T.cycleS) * T.cycleS;
  if (inCycle >= T.greenS) return 0;
  const x = inCycle / T.greenS;
  return ((6 * x * (1 - x)) / T.greenS) * T.blockM;
}

/** Writes where the vehicle is at `timeS` into `out`. */
export function vehiclePose(v: Vehicle, timeS: number, out: VehiclePose): VehiclePose {
  const along = (((v.startM + blocksTravelled(v.alongZ, timeS) * T.blockM) % T.laneLengthM) + T.laneLengthM) % T.laneLengthM;
  const coordinate = v.direction === 1 ? along - T.laneLengthM / 2 : T.laneLengthM / 2 - along;
  const lane = v.avenue + v.direction * T.laneOffsetM * (v.alongZ ? -1 : 1);
  out.x = v.alongZ ? lane : coordinate;
  out.z = v.alongZ ? coordinate : lane;
  // Yaw 0 faces -Z. Heading +Z is PI; heading +X is -PI/2.
  const heading = v.alongZ ? (v.direction === 1 ? Math.PI : 0) : v.direction === 1 ? -Math.PI / 2 : Math.PI / 2;
  out.yawRad = heading;
  out.speedMps = laneSpeed(v.alongZ, timeS);
  return out;
}
