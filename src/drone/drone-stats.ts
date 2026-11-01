/** What a drone setup changes about flight and battery. Phase 3 parts only edit these numbers. */
export interface DroneStats {
  /** Scales top speed (through drag). */
  topSpeedFactor: number;
  /** Tilt response, turn rate and drift assist. */
  gripFactor: number;
  /** Climb rate and acceleration. */
  liftFactor: number;
  /** Battery current multiplier. */
  drainFactor: number;
  /** 0..1 small attitude jitter (twitchy props). */
  wobble: number;
  /** All-up weight; affects lift and acceleration. */
  massKg: number;
  cells: number;
  capacityMah: number;
}

export const STOCK_MASS_KG = 0.642;

export const STOCK_STATS: Readonly<DroneStats> = {
  topSpeedFactor: 1,
  gripFactor: 1,
  liftFactor: 1,
  drainFactor: 1,
  wobble: 0,
  massKg: STOCK_MASS_KG,
  cells: 4,
  capacityMah: 1500,
};
