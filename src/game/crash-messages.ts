import type { CrashReason } from '../physics/resolve';

/** Player-facing text for each crash reason. */
export const CRASH_MESSAGES: Readonly<Record<CrashReason, string>> = {
  ground: 'Hit the ground',
  water: 'Splashed into the lake',
  gate: 'Hit a gate',
  factory: 'Hit the factory',
  container: 'Hit a container',
  building: 'Hit a building',
  tree: 'Hit a tree',
  vehicle: 'Hit a vehicle',
};
