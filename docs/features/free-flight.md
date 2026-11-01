# Feature: Free Flight

Status: Planned
Phase: 1
Branch: `feat/free-flight`
Last updated: 2026-11-01

## Summary

No timer, no rules: take off from the pad and explore the valley. The place to learn the controls.

## Player experience

Choose Free flight. The drone sits on the landing pad in the pit area. A short hint shows the keys. Fly anywhere: through the factory, over the lake, through the gates, up to the hills. Crash and you respawn on the pad, or at the last gate you flew through.

## Behavior and rules

- **Start:** on the pad, landed (height 0.0 m), facing along the start straight. No countdown.
- **Gates:** still glow; passing them in order updates the gate counter and the respawn point, but no timing.
- **Respawn:** last passed gate, or the pad if none passed yet.
- **Battery:** drains as normal (see battery-system). Land on the pad and hold still for 2 s to swap in a fresh battery. If it empties, the drone falls and respawns on the pad with a fresh battery. Settings can turn battery drain off for free flight.
- **Area:** a box 1,800 m × 1,800 m (±900 m from the centre) with a 300 m ceiling. The drone cannot leave it: it stops at the wall and keeps any speed along the wall. A faint grid fades in on the walls and ceiling when the drone is within about 140 m, so the limit is visible without spoiling the scene. Values in `config.ts` → `WORLD.bounds` and `WORLD.boundaryGrid`. (Replaces the earlier "Signal lost, respawn after 3 s" idea: players found flying past the edge into the void a bug, so the edge is now a hard wall.)
- **Exit:** P or "Exit to menu".

## UI

- Mode tag (top left): "Free flight", hint "Fly anywhere. Click the view to steer with the mouse."
- Gate counter shown; race panel hidden.
- Height gauge, battery gauge, help bar, minimap, flight menu as usual.

## Technical design

- `src/game/modes/free-flight.ts`: sets the spawn, enables gate tracking without timing, handles out-of-bounds.
- Reuses `game/lap-tracker.ts` for gate order (timing ignored) and the shared respawn logic from collisions-and-crash. No mode-specific copies of physics or respawn code.
- Bounds values in `config.ts` → `WORLD.bounds`.

## Edge cases

- Flying out of bounds over the mountains: warning, then respawn.
- Landing on the factory roof: allowed (roof is a collider).

## Acceptance criteria

- [ ] Starts landed on the pad with no countdown.
- [ ] Respawn uses the last gate passed, or the pad.
- [ ] Out-of-bounds warning appears and respawns after 3 s.
- [ ] No lap timer anywhere on screen.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Start free flight | On the pad, `0.0 m`, no countdown | Manual |
| 2 | Crash before any gate | Respawn on the pad | Manual |
| 3 | Pass gates 0 and 1, then crash | Respawn at gate 1 facing gate 2 | Manual |
| 4 | Climb above 150 m | Warning and static; respawn after 3 s | Manual |

## Out of scope

Friends flying in the same world (Phase 5). Training lessons (Phase 2).

## Changelog

- 2026-11-01: Created.
