import { ONLINE, TRACK_DEFS, type TrackId } from '../../src/config';
import type { LapSubmission } from '../../src/core/lap-validation';

const CLASS = 'spec';

export interface LeaderboardRow {
  id: string;
  name: string;
  lapTimeS: number;
  rank: number;
}

export interface SubmitResult {
  status: 'saved' | 'not-faster' | 'too-soon';
  id: string | null;
  rank: number | null;
}

interface ExistingRow {
  id: string;
  lap_time_ms: number;
  created_at: number;
}

/** 1-based place of a lap time. Reads only the faster laps through the leaderboard index. */
async function rankOf(db: D1Database, worldVersion: number, lapTimeMs: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS faster FROM laps WHERE class = ?1 AND world_version = ?2 AND lap_time_ms < ?3')
    .bind(CLASS, worldVersion, lapTimeMs)
    .first<{ faster: number }>();
  return (row?.faster ?? 0) + 1;
}

/**
 * Stores a lap only when it is the pilot's first or a faster one. Slower laps write nothing, so a buggy or
 * hostile client cannot burn the daily write quota by repeating itself.
 */
export async function submitLap(db: D1Database, lap: LapSubmission, nowS: number): Promise<SubmitResult> {
  // Each track has its own world version, so its laps and leaderboard are separate rows and never mix.
  const worldVersion = TRACK_DEFS[lap.track].worldVersion;
  const lapTimeMs = Math.round(lap.lapTimeS * 1000);
  const existing = await db
    .prepare('SELECT id, lap_time_ms, created_at FROM laps WHERE pilot_id = ?1 AND class = ?2 AND world_version = ?3')
    .bind(lap.pilotId, CLASS, worldVersion)
    .first<ExistingRow>();

  if (existing) {
    if (nowS - existing.created_at < ONLINE.minSecondsBetweenSubmissions) return { status: 'too-soon', id: existing.id, rank: null };
    if (lapTimeMs >= existing.lap_time_ms) return { status: 'not-faster', id: existing.id, rank: await rankOf(db, worldVersion, existing.lap_time_ms) };
  }

  const id = crypto.randomUUID();
  // The WHERE keeps a faster stored lap safe if two requests race.
  const result = await db
    .prepare(
      `INSERT INTO laps (id, pilot_id, name, class, world_version, lap_time_ms, splits, ghost, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (pilot_id, class, world_version) DO UPDATE SET
         id = excluded.id, name = excluded.name, lap_time_ms = excluded.lap_time_ms,
         splits = excluded.splits, ghost = excluded.ghost, created_at = excluded.created_at
       WHERE excluded.lap_time_ms < laps.lap_time_ms`,
    )
    .bind(id, lap.pilotId, lap.name, CLASS, worldVersion, lapTimeMs, JSON.stringify(lap.splitsS), JSON.stringify(lap.ghost), nowS)
    .run();
  if (result.meta.changes === 0) return { status: 'not-faster', id: existing?.id ?? null, rank: null };
  return { status: 'saved', id, rank: await rankOf(db, worldVersion, lapTimeMs) };
}

export async function leaderboard(db: D1Database, track: TrackId, limit: number): Promise<LeaderboardRow[]> {
  const rows = await db
    .prepare('SELECT id, name, lap_time_ms FROM laps WHERE class = ?1 AND world_version = ?2 ORDER BY lap_time_ms ASC LIMIT ?3')
    .bind(CLASS, TRACK_DEFS[track].worldVersion, limit)
    .all<{ id: string; name: string; lap_time_ms: number }>();
  return rows.results.map((row, index) => ({ id: row.id, name: row.name, lapTimeS: row.lap_time_ms / 1000, rank: index + 1 }));
}

export interface GhostRow {
  /** The track the lap was flown on, so a client on another track can switch before racing it. */
  track: TrackId;
  name: string;
  lapTimeS: number;
  splitsS: number[];
  ghost: { hz: number; data: string };
}

export async function getGhost(db: D1Database, id: string): Promise<GhostRow | null> {
  const row = await db
    .prepare('SELECT name, world_version, lap_time_ms, splits, ghost FROM laps WHERE id = ?1')
    .bind(id)
    .first<{ name: string; world_version: number; lap_time_ms: number; splits: string; ghost: string }>();
  if (!row) return null;
  const track = (Object.keys(TRACK_DEFS) as TrackId[]).find((t) => TRACK_DEFS[t].worldVersion === row.world_version);
  if (!track) return null; // a lap from a world version this build no longer knows
  return { track, name: row.name, lapTimeS: row.lap_time_ms / 1000, splitsS: JSON.parse(row.splits) as number[], ghost: JSON.parse(row.ghost) as { hz: number; data: string } };
}
