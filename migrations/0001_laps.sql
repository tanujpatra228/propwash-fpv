-- One best lap per pilot, per class, per world version. Ghost data is stored with it (a few KB).
CREATE TABLE IF NOT EXISTS laps (
  id            TEXT PRIMARY KEY,
  pilot_id      TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  class         TEXT    NOT NULL DEFAULT 'spec',
  world_version INTEGER NOT NULL,
  lap_time_ms   INTEGER NOT NULL,
  splits        TEXT    NOT NULL,
  ghost         TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

-- A pilot has one row per class and world version.
CREATE UNIQUE INDEX IF NOT EXISTS laps_pilot ON laps (pilot_id, class, world_version);

-- The leaderboard reads the first rows of this index, not the whole table.
CREATE INDEX IF NOT EXISTS laps_board ON laps (class, world_version, lap_time_ms);
