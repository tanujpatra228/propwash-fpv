import { TRACK, WORLD } from '../config';
import { loadJson, saveJson } from '../core/storage';
import type { GhostData } from '../drone/ghost';
import type { BestLap } from './lap-tracker';

/** A saved best lap with its ghost. The world version is in the key, so a changed world never shows a stale ghost. */
export interface SavedBestLap {
  lapTimeS: number;
  splitsS: number[];
  ghost: GhostData;
}

const keyFor = (worldVersion: number): string => `trial.valley-sprint.w${worldVersion}.v1`;
const KEY = keyFor(WORLD.version);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isSavedBestLap(value: unknown): value is SavedBestLap {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const ghost = v['ghost'];
  if (typeof ghost !== 'object' || ghost === null) return false;
  const g = ghost as Record<string, unknown>;
  return (
    isFiniteNumber(v['lapTimeS']) &&
    v['lapTimeS'] > 0 &&
    Array.isArray(v['splitsS']) &&
    v['splitsS'].length === TRACK.gateCount &&
    v['splitsS'].every(isFiniteNumber) &&
    isFiniteNumber(g['hz']) &&
    typeof g['data'] === 'string'
  );
}

export function loadBestLap(): SavedBestLap | null {
  return loadJson(KEY, isSavedBestLap);
}

/** The best lap saved for another track (for the map cards), looked up by that track's world version. */
export function loadBestLapForVersion(worldVersion: number): SavedBestLap | null {
  return loadJson(keyFor(worldVersion), isSavedBestLap);
}

/** Returns false when storage is blocked (the best lap then lasts for this session only). */
export function saveBestLap(best: SavedBestLap): boolean {
  return saveJson(KEY, best);
}

export function toTrackerBest(saved: SavedBestLap): BestLap {
  return { lapTimeS: saved.lapTimeS, splitsS: saved.splitsS };
}
