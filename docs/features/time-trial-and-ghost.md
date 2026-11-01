# Feature: Time Trial and Ghost

Status: Planned
Phase: 1
Branch: `feat/time-trial`
Last updated: 2026-11-01

## Summary

Fly laps of Valley Sprint against the clock. Your best lap is saved in the browser and replayed as a translucent ghost drone that you race on every lap.

## Player experience

Choose Time trial. The drone hovers behind the start gate. 3, 2, 1, GO. The clock starts when you fly through the start gate. Fly through all 12 gates in order; the next one is always marked. At each gate a split shows whether you are ahead (green) or behind (red) your best. Finish the lap and the time appears; if it's your best, "New best lap" flashes and the ghost updates. The ghost replays your best lap starting at the same moment as your current lap. Keep flying laps as long as you like.

## Behavior and rules

- **Start:** drone placed 4 m behind gate 0, facing it, hovering at gate height. Input locked during the 3 s countdown.
- **Lap timing:** the timer for lap 1 starts when the drone crosses gate 0 after GO (flying start). Each later lap starts the moment the previous one ends.
- **Gates:** must be passed in order (see track-and-gates). Missing a gate means you must go back for it; the lap only ends at gate 0 after gate 11.
- **Splits:** time at each gate compared to the same gate in the best lap. Shown for 2 s.
- **Reset (R) or crash:** respawn at the last passed gate; the lap timer keeps running.
- **Best lap:** lowest completed lap time. Saved with its ghost.
- **Exit:** P or "Exit to menu" ends the session; the best lap stays saved.

### Ghost

- Recorded at 20 Hz during every lap: position (x, y, z) and orientation (yaw, pitch, roll), quantized to 1 cm and 0.01 rad.
- When a lap beats the best, its recording becomes the new ghost.
- Playback interpolates between samples at the current lap time; the ghost disappears when its lap ends.
- Ghost uses the translucent drone model (see drone-model) and a "Best lap" tag.
- Size target: about 45 s × 20 Hz × 6 values ≈ 5,400 numbers, stored as delta-encoded integers, under 20 KB.

### Storage

- Key `pw.trial.valley-sprint.w<WORLD.version>.v1`: `{ lapTimeS, splitsS[12], ghost: { hz, data } }`.
- The world version in the key means a changed world never shows an invalid ghost.

## Technical design

- `src/game/lap-tracker.ts` (pure): tracks the next gate, lap start, splits and completed laps from gate-crossing events; `onGateCrossed(index, timeS)`, `currentLapTimeS(nowS)`.
- `src/drone/ghost.ts` (pure): `GhostRecorder` (`record(timeS, pos, quat)`, `finish()`), `GhostTrack` (`sample(timeS, outPos, outQuat)`), `encodeGhost`/`decodeGhost`.
- `src/game/modes/time-trial.ts`: wires countdown, lap tracker, recorder, ghost playback, storage, HUD state.
- Storage through `core/storage.ts`.
- This format will be reused unchanged for online ghosts in Phase 3 (Cloudflare D1).

## Edge cases

- First time playing: no ghost, splits show "--".
- Storage blocked: best lap kept for the session only.
- Corrupt saved data: ignored, treated as no best lap.
- Very slow lap (over 10 min): recording stops at 10 min to cap memory; the lap still counts.

## Acceptance criteria

- [ ] Countdown locks input; the timer starts at the first gate-0 crossing.
- [ ] Laps only complete after all 12 gates in order.
- [ ] Splits compare correctly with the best lap.
- [ ] Best lap and ghost survive a page reload.
- [ ] Ghost replays the best lap in sync with the current lap.
- [ ] Encoded ghost for a 45 s lap is under 20 KB.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Lap tracker: gates 0,1,…,11,0 at known times | One lap with the right time and splits | Unit |
| 2 | Lap tracker: skip gate 5 | Lap doesn't complete at gate 0 | Unit |
| 3 | Encode then decode a ghost | Samples match within 1 cm / 0.01 rad | Unit |
| 4 | Encoded size of a 45 s ghost | < 20 KB | Unit |
| 5 | Fly two laps, second faster; reload; start time trial | Ghost replays lap 2; best time shown | Manual |
| 6 | Crash mid-lap | Respawn at last gate, timer keeps running | Manual |

## Out of scope

Online leaderboard and friends' ghosts (Phase 3). Multiple tracks (Phase 5).

## Changelog

- 2026-11-01: Created.
