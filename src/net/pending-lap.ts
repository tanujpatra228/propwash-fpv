import { ACTIVE_TRACK_ID, isTrackId, TRACK, type TrackId } from '../config';
import type { GhostData } from '../core/ghost-codec';
import { loadJson, saveJson } from '../core/storage';

/** A new best lap waiting to be uploaded (offline, no name yet, or the server was busy). Only the latest matters. */
export interface PendingLap {
  /** The track it was flown on (it may be uploaded after the player switched tracks). */
  track: TrackId;
  lapTimeS: number;
  splitsS: number[];
  ghost: GhostData;
  attempts: number;
}

const KEY = 'pendingLap.v1';
/** Give up on a lap after this many failed tries, so a lap the server dislikes cannot be retried forever. */
export const MAX_ATTEMPTS = 5;

function isPendingLap(v: unknown): v is PendingLap {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const ghost = r['ghost'];
  return (
    isTrackId(r['track']) &&
    typeof r['lapTimeS'] === 'number' &&
    Array.isArray(r['splitsS']) &&
    r['splitsS'].length === TRACK.gateCount &&
    typeof r['attempts'] === 'number' &&
    typeof ghost === 'object' &&
    ghost !== null &&
    typeof (ghost as Record<string, unknown>)['data'] === 'string'
  );
}

export function loadPendingLap(): PendingLap | null {
  return loadJson(KEY, isPendingLap);
}

export function savePendingLap(lap: PendingLap): void {
  saveJson(KEY, lap);
}

export function clearPendingLap(): void {
  saveJson(KEY, null);
}
