# Feature: Track and Gates

Status: Planned
Phase: 1
Branch: `feat/track-and-gates`
Last updated: 2026-11-01

## Summary

The "Valley Sprint" race track: a closed spline loop of about 1.1 km through the valley, with 12 glowing race gates that must be flown through in order.

## Player experience

Orange padded gates with bright LED strips stand across the valley, on legs down to the ground where needed. The first gate has a checkered "START · FINISH" banner. The route crosses the pit straight, climbs over a hill, runs through the old factory, skims the lake and loops back.

## Behavior and rules

- **Route:** 11 control points (defined in `config.ts` `TRACK.points`) joined by a closed centripetal Catmull-Rom spline.
- **Height:** each control point sits a set clearance above the highest ground within 14 m. Through the factory the line sits 3.4 m above the floor (roof at 9.2 m); over the lake 2.4 m above the water. The sampled line is smoothed and never closer than 1.8 m to the ground outside the factory.
- **Sampling:** the spline is sampled into 4,000 evenly spaced points with tangents and smoothed curvature vectors. All track queries use these samples.
- **Gates:** 12, evenly spaced along the track (gate 0 = start/finish). Inner opening 4.2 m wide × 3.0 m tall, frame 0.3 m thick, facing along the track direction. Legs reach the ground when the gate floats.
- **Gate order:** a gate counts only when it is the next expected gate and the drone crosses its plane from the front side inside the opening. Passing another gate does nothing.
- **Lap:** passing gate 0 after all other gates completes a lap.

## UI

- Next gate highlighted on screen by the gate marker (see hud-and-osd).
- Minimap shows the track line, lake, factory and the start gate.

## Technical design

- `src/world/track.ts`: builds the spline and samples; exports a `Track` object with `lengthM`, `sampleAt(u, out)`, `tangentAt(u, out)`, `curvatureAt(u, out)`, `poseAt(distM, lateralOffsetM, speedMps, outPos, outQuat)` (thrust-direction banking for AI and ghosts), `nearestSampleIndex(pos)`, `distanceToTrack(x, z)`.
- `src/world/gates.ts`: builds gate meshes (shared geometries and materials), the start banner and legs; registers each frame bar as a collision box; exports `Gate[]` (`index`, `position`, `forward`, `group`) and `checkGateCrossing(gate, prevPos, pos): boolean` (pure, local-space plane test).
- Gate counting state lives in `game/lap-tracker.ts` (shared by time trial and free flight), not in the gate meshes.

## Edge cases

- Drone crosses a gate plane from behind: not counted.
- Drone clips the frame: collision (see collisions-and-crash) and not counted.
- Very high speed (large step per frame): crossing uses the segment from the previous to the current position, so it is never skipped.
- Reset to last gate places the drone in front of that gate so it is not counted twice.

## Acceptance criteria

- [ ] Track length 1.0–1.2 km, displayed in the menu.
- [ ] All 12 gates face along the track, sit on the racing line, and none intersect terrain.
- [ ] Gates with a gap under them have legs that reach the ground.
- [ ] Gate crossing counts only the next gate, from the front, inside the opening.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `checkGateCrossing` with a segment through the centre, front to back | `true` | Unit |
| 2 | Same segment, back to front | `false` | Unit |
| 3 | Segment crossing the plane 0.5 m outside the opening | `false` | Unit |
| 4 | Fly through gate 3 while gate 1 is next | Counter stays on gate 1 | Manual |
| 5 | Fly the track in chase camera | Every gate stands on the line; legs touch the ground | Manual |

## Out of scope

More tracks, track editor, moving gates (Phase 6).

## Changelog

- 2026-11-01: Created.
- 2026-11-01: M3: `world/track.ts` (spline, samples, `poseAt`) was built early in M3 because scenery placement depends on it. Gates and lap logic stay in M4.
