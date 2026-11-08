import { BATTERY } from '../config';
import { clamp, clamp01, damp } from '../core/math';
import type { DroneStats } from './drone-stats';

const CURVE = BATTERY.cellCurve;

/** Resting voltage of one cell at a given charge (linear between the curve points). */
export function cellVoltageAt(charge01: number): number {
  const c = clamp01(charge01);
  for (let i = 1; i < CURVE.length; i++) {
    const hi = CURVE[i];
    const lo = CURVE[i - 1];
    if (hi && lo && c <= hi[0]) return lo[1] + ((c - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]);
  }
  return CURVE[CURVE.length - 1]?.[1] ?? 0;
}

/** Current in amps for an effort of 0..1. The one place this formula lives. */
export function currentForEffort(effort01: number, drainFactor: number): number {
  const effort = clamp01(effort01);
  return (BATTERY.hoverCurrentA + BATTERY.extraCurrentA * effort ** BATTERY.effortExponent) * drainFactor;
}

export class Battery {
  charge01 = 1;
  mAhUsed = 0;
  currentA = 0;
  voltage: number;
  private averageCurrentA: number = BATTERY.hoverCurrentA;
  private cells: number;
  private capacityMah: number;
  private drainFactor: number;

  constructor(stats: Pick<DroneStats, 'cells' | 'capacityMah' | 'drainFactor'>) {
    this.cells = stats.cells;
    this.capacityMah = stats.capacityMah;
    this.drainFactor = stats.drainFactor;
    this.voltage = this.restingVoltage();
    this.averageCurrentA = currentForEffort(0, this.drainFactor);
  }

  get isEmpty(): boolean {
    return this.charge01 <= 0;
  }

  /** 1 at full power, easing to 0.6 at the end of the low-battery range, 0 when empty. */
  get powerFactor(): number {
    if (this.isEmpty) return 0;
    if (this.charge01 >= BATTERY.lowChargeThreshold01) return 1;
    return BATTERY.lowPowerBase + BATTERY.lowPowerSlope * this.charge01;
  }

  get isLow(): boolean {
    return !this.isEmpty && this.charge01 < BATTERY.lowChargeThreshold01;
  }

  step(effort01: number, dtS: number): void {
    if (dtS <= 0) return;
    if (this.isEmpty) {
      this.currentA = 0;
      this.voltage = this.restingVoltage();
      return;
    }
    this.currentA = currentForEffort(effort01, this.drainFactor);
    const usedMah = (this.currentA * dtS * 1000) / 3600;
    this.mAhUsed += usedMah;
    this.charge01 = clamp(this.charge01 - usedMah / this.capacityMah, 0, 1);
    this.averageCurrentA = damp(this.averageCurrentA, this.currentA, 1 / BATTERY.averageCurrentTauS, dtS);
    const resistance = (BATTERY.internalResistanceOhm4s * this.cells) / 4;
    this.voltage = this.restingVoltage() - this.currentA * resistance;
  }

  /** Swaps in a different pack (a new setup). Charges it fully. */
  configure(stats: Pick<DroneStats, 'cells' | 'capacityMah' | 'drainFactor'>): void {
    this.cells = stats.cells;
    this.capacityMah = stats.capacityMah;
    this.drainFactor = stats.drainFactor;
    this.refill();
  }

  refill(): void {
    this.charge01 = 1;
    this.mAhUsed = 0;
    this.currentA = 0;
    this.averageCurrentA = currentForEffort(0, this.drainFactor);
    this.voltage = this.restingVoltage();
  }

  /** Time left at the recent average draw. */
  estimateSecondsLeft(): number {
    const remainingMah = this.charge01 * this.capacityMah;
    return (remainingMah / 1000 / Math.max(0.1, this.averageCurrentA)) * 3600;
  }

  private restingVoltage(): number {
    return this.cells * cellVoltageAt(this.charge01);
  }
}

/** Flight time in seconds at a steady racing effort, for comparing setups in the Hangar. */
export function estimateRacingSeconds(stats: Pick<DroneStats, 'capacityMah' | 'drainFactor'>, effort01: number): number {
  return (stats.capacityMah / 1000 / currentForEffort(effort01, stats.drainFactor)) * 3600;
}
