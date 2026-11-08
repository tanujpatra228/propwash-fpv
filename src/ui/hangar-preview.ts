/** What the Hangar shows for a setup: numbers for the stat bars, all derived from `buildStats` so nothing is recombined here. */
import { PARTS } from '../config';
import { estimateRacingSeconds } from '../drone/battery';
import { STOCK_STATS } from '../drone/drone-stats';
import { buildStats, type DroneSetup } from '../drone/parts';

export interface HangarStats {
  /** Relative to the stock drone: 1 is the same. */
  speed: number;
  grip: number;
  lift: number;
  flightTimeS: number;
}

export function hangarStats(setup: Readonly<DroneSetup>): HangarStats {
  const stats = buildStats(setup);
  return {
    speed: stats.topSpeedFactor,
    grip: stats.gripFactor,
    // Heavier packs lose lift and acceleration, so show the effective figure.
    lift: (stats.liftFactor * STOCK_STATS.massKg) / stats.massKg,
    flightTimeS: estimateRacingSeconds(stats, PARTS.racingEffort01),
  };
}

export type StatKey = keyof HangarStats;

/** How a preview compares with what is equipped now: better, worse or the same (within 1%). */
export function compare(now: number, preview: number): 'better' | 'worse' | 'same' {
  const ratio = preview / now;
  return ratio > 1.01 ? 'better' : ratio < 0.99 ? 'worse' : 'same';
}
