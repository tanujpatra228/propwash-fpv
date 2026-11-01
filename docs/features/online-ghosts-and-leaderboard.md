# Feature: Online Ghosts and Leaderboard

Status: In progress
Phase: 4
Branch: `feat/phase-4`
Last updated: 2026-11-01

## Summary

Your best lap is uploaded under a pilot name, a shared leaderboard shows the fastest laps, and you can race any pilot's ghost, including from a link a friend sends you. No accounts, no passwords. It runs on the Cloudflare free plan: one small Worker plus one D1 database.

## Player experience

- First time you set a best lap online, a small prompt asks for a **pilot name** (3 to 16 letters, numbers, spaces, `_` or `-`). It is stored in your browser.
- Each new personal best is sent automatically, once per lap, after the lap finishes. If you are offline it is kept and sent next time you open the menu.
- Main menu gets a **Leaderboard** button: the 20 fastest laps with name, time and gap to first. Pick one: **Race this ghost** starts a time trial against that pilot's ghost (your own best-lap ghost is replaced by theirs for that run).
- **Copy link** on a leaderboard row gives a URL ending `?ghost=<id>`. Opening it starts a time trial against that ghost directly.
- Nothing blocks the game: if the server is slow or down, the leaderboard says "Offline" and everything else works.

## Behavior and rules

- **One best lap per pilot per world version.** Submitting a slower lap changes nothing.
- A lap is accepted only if all of these hold (server-side, cheap checks):
  - the world version matches the server's current `WORLD.version`;
  - lap time is between 30 s and 600 s (the track is about 1.1 km and top speed 28 m/s, so under 30 s is impossible);
  - the ghost data decodes, has the right shape, and its length matches the lap time within 5%;
  - no jump between two ghost samples faster than 45 m/s (hiding teleports);
  - the ghost starts within 30 m of the start gate;
  - the whole request is under 40 KB.
- This is **not** anti-cheat: a determined person can still forge a plausible lap. The plan says the game is for friends; the checks only stop accidents and obvious junk.
- Pilot ids are random UUIDs kept in the browser; they only tell one browser's laps apart. They are not secrets and nobody is verified.
- **Pilot names** (`core/pilot-name.ts`, shared by game and server): 2 to 12 characters, where an emoji (even a family emoji) counts as one. Letters and numbers from any language, emoji, and the separators space, `_`, `-` and `.` are allowed; they cannot start or end a name, and at least 2 visible characters are needed. Everything else is refused, never silently changed: markup and symbols, control and invisible characters (zero-width, right-to-left override, blank braille), more than 2 stacked combining marks on one character, a single "character" hiding a pile of code points, and absurdly long input (refused before any heavy work). Spaces are collapsed and the text normalised (NFC). The leaderboard also truncates with an ellipsis, so a wide name can never break the layout.
- Classes: Phase 3 (Spec and Open) is skipped for now, so there is one class, `spec`, with stock parts. The table has a `class` column set to `spec` so Phase 3 can add `open` later without a migration.

## API (Worker, JSON)

| Method and path | Purpose | Notes |
|---|---|---|
| `POST /api/laps` | Submit a best lap | Body `{ pilotId, name, worldVersion, lapTimeS, splitsS[12], ghost: { hz, data } }`. Returns `{ id, rank, isPersonalBest }` |
| `GET /api/leaderboard?limit=20` | Fastest laps | Returns `[{ id, name, lapTimeS, rank }]`. `Cache-Control: public, max-age=30` |
| `GET /api/ghosts/:id` | One lap's ghost | Returns `{ name, lapTimeS, splitsS, ghost }`. `Cache-Control: public, max-age=300, immutable` (laps never change; a new best gets a new id) |

All paths under `/api/` run the Worker first; every other path is a static asset (free, not counted as Worker requests).

## Data

D1 table `laps` (migration `migrations/0001_laps.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT primary key | Random id, used in links |
| `pilot_id` | TEXT | Browser-local UUID |
| `name` | TEXT | 3 to 16 characters |
| `class` | TEXT | `spec` for now |
| `world_version` | INTEGER | |
| `lap_time_ms` | INTEGER | |
| `splits` | TEXT | JSON array |
| `ghost` | TEXT | JSON `{ hz, data }` |
| `created_at` | INTEGER | Unix seconds |

Unique index on `(pilot_id, class, world_version)`; index on `(class, world_version, lap_time_ms)` so the leaderboard reads about 20 rows, not the whole table.

## Free-plan budget (checked against Cloudflare's published free limits on 2026-11-01)

Assumed use: 50 daily players, 10 laps each, each opens the leaderboard 3 times and fetches 2 ghosts.

| Resource | Estimated per day | Free limit | OK? |
|---|---|---|---|
| Worker requests | 500 submits (only personal bests are sent, so fewer) + 150 leaderboard (mostly cached) + 100 ghosts, about 750 | 100,000 | Yes, under 1% |
| Worker CPU per request | Under 5 ms (decode and check up to about 900 ghost samples, no 3D maths) | 10 ms | Yes, but watch it (test below) |
| D1 rows written | One upsert per accepted best lap: about 500 (index updates counted generously: 1,500) | 100,000 | Yes |
| D1 rows read | Leaderboard about 20 rows x 150 = 3,000; ghosts 100; submit checks 500 | 5,000,000 | Yes |
| D1 storage | Ghost 4 to 12 KB x 1 row per pilot; 1,000 pilots = about 12 MB | 500 MB per database, 5 GB per account | Yes |
| Static assets | Any amount | Free, unlimited | Yes |

Headroom is 100x or more on every line, so a viral day does not break it. If a daily limit were hit, D1 queries fail until 00:00 UTC; the client handles errors and shows "Offline", and the rest of the game is unaffected.

Design rules that keep it free (from the standards):
- No call from the game loop. Requests happen: when a lap finishes with a new personal best, when the leaderboard opens, when a ghost is chosen.
- Writes only on improvement, so a buggy client cannot burn the write quota by spamming slower laps.
- Rate limit: at most one accepted submission per pilot id per 10 s (checked against `created_at`).
- Leaderboard and ghosts use HTTP caching so repeat views never reach the Worker.

## Technical design

- `worker/src/index.ts`: routing (`fetch` handler); `worker/src/laps.ts` (D1 queries); `worker/src/validate.ts` (pure, tested checks, shares the ghost decoder with the game).
- `src/drone/ghost-codec.ts`: the decode part of the ghost format with no Three.js dependency, so the Worker bundle stays small (the `GhostTrack` class keeps using it).
- `src/net/api.ts`: browser client with timeouts, no throwing (returns `null` on failure), and a small queue of unsent laps in `localStorage` (`pw.pending-lap.v1`).
- `src/ui/leaderboard-screen.ts`, `src/ui/name-prompt.ts`; main menu button; `?ghost=<id>` handling in `main.ts`.
- `src/game/modes/time-trial.ts` accepts an optional external ghost.
- `wrangler.jsonc`: `main` for the Worker, `assets.binding`, `run_worker_first: ["/api/*"]`, a D1 binding, a fixed `compatibility_date`.
- CI: a step applies D1 migrations (`wrangler d1 migrations apply --remote`) before deploy. **The Cloudflare API token needs D1 Edit permission.**
- Dev dependencies (exact pins, logged): `@cloudflare/workers-types`.

## Edge cases

- Browser storage blocked: pilot id and name last only for the session; the pending-lap queue is skipped.
- Two tabs submitting at once: the unique index and the "only if better" upsert make it safe.
- A saved lap from an older world version: never uploaded; the leaderboard only shows the current version.
- Server returns an error: the lap stays in the queue and is retried at the next menu open, at most 3 attempts per lap per day.
- Time zone and clocks: the server uses its own clock.

## Acceptance criteria

- [ ] A new personal best is uploaded once; slower laps are never uploaded.
- [ ] The leaderboard shows the fastest lap per pilot, sorted, with gaps.
- [ ] Racing another pilot's ghost replays their lap in sync.
- [ ] `?ghost=<id>` starts a race against that ghost.
- [ ] Junk submissions (impossible time, bad ghost, wrong world, oversize) are rejected with a clear error.
- [ ] With the server unreachable, the game works and the leaderboard says "Offline".
- [ ] Every budget line above holds in a local load test.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Validate a good lap | Accepted | Unit |
| 2 | Validate lap time 20 s, 700 s, NaN | Rejected | Unit |
| 3 | Validate a ghost with a 200 m teleport | Rejected | Unit |
| 4 | Validate a ghost whose length disagrees with the lap time | Rejected | Unit |
| 5 | Name checks (too short, too long, markup, odd characters) | Rejected or cleaned | Unit |
| 6 | Local Worker + D1: submit, submit slower, submit faster | One row, kept the faster | Integration |
| 7 | Local Worker: leaderboard order and caching headers | Sorted; `max-age=30` | Integration |
| 8 | Browser: set a lap offline, go online | Lap uploaded on next menu open | Manual |
| 9 | Open `?ghost=<id>` | Time trial against that ghost | Manual |

## Implementation notes

- Built and tested so far (branch `feat/phase-4`): `core/pilot-name.ts` (16 tests), `core/ghost-codec.ts` (decoder with no 3D library, so the Worker stays small), `core/lap-validation.ts` (14 tests, about 1 ms per lap), `worker/` (routes, D1 queries), `migrations/0001_laps.sql`.
- **Verified locally with a real Worker and a local D1 database** (`wrangler dev --local`): first lap saved at rank 1; an immediate repeat is refused (429); a slower lap changes nothing; a faster one replaces it; a second pilot with an emoji name is rank 2; markup name, 12 s lap, 500-character name, 100 KB body and non-JSON are all refused with clear errors and the leaderboard stays clean; caching headers are `max-age=30` (leaderboard) and `max-age=300, immutable` (ghost); the game page is still served as a static asset. A 40 s lap's ghost is 6 KB.
- Rank counting reads the faster laps through the index, so it grows with the number of pilots (1,000 pilots is still about 500 K rows a day at the assumed submit rate, 10% of the free read limit).

## Out of scope

Accounts, passwords, verified identities, anti-cheat beyond the checks above, Spec and Open classes (Phase 3), live racing (Phase 5).

## Changelog

- 2026-11-01: Created.
