/** Single source of truth for tunable values. Each later milestone adds its own section. */

export const LOOP = {
  /** Largest simulated step; protects physics after a hidden tab or a stall. */
  maxDtS: 1 / 20,
  /** Smallest step; avoids divide-by-zero when two frames share a timestamp. */
  minDtS: 0.0001,
} as const;

export const WORLD = {
  /** Bump when noise or seeds change: it invalidates saved ghosts and best laps. */
  version: 1,
  seed: 1337,
} as const;

export const STORAGE_PREFIX = 'pw.';
