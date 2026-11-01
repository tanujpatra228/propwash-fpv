# Feature: Collisions and Crash

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M4)
Last updated: 2026-11-01

## Summary

The drone can hit things. Gentle touches bump it away; hard hits crash it, show static and respawn it at the last gate.

## Player experience

Clip a gate post slowly and the drone bounces off. Fly into a tree, a wall, the ground or the lake at speed and the goggles fill with static, a "Crashed" banner appears with the reason, and 1.6 s later the drone is back at the last gate, facing the next one.

## Behavior and rules

Values in `config.ts` → `COLLISION`.

| Rule | Value |
|---|---|
| Drone collision radius | 0.18 m |
| Ground | Crash if speed > 8 m/s on contact; otherwise rest 0.1 m above ground, stop downward speed, slide friction 0.85 |
| Water (lake) | Any contact with the surface = crash ("Splashed into the lake") |
| Obstacles | Gate frame bars, factory pillars/roof/walls/beams, containers, pit tent and table, houses, tree trunks |
| Obstacle hit | Crash if speed > 4 m/s; otherwise push out along the surface normal and remove the velocity into the surface |
| Tree shape | Vertical cylinder, radius 0.5 m × tree scale, from ground to 10 m × scale (core of the tree, so outer branches are forgiving) |
| Crash time | 1.6 s, input ignored, static 0.4 → 1.0 |
| Respawn | At the last passed gate (or the pad in free flight if none), 0.3 m above ground if needed, facing the next gate, zero velocity |
| Manual reset | **R** respawns immediately (no crash) |

Crash reasons: "Hit the ground", "Splashed into the lake", "Hit a gate", "Hit the factory", "Hit a container", "Hit a building", "Hit a tree".

**Battery empty** is not a crash reason by itself: the motors cut and the drone falls (see battery-system). Touching the ground or water afterwards (or 3 s passing) ends the time-trial run or respawns on the pad in free flight, using the "Battery empty" banner instead of "Crashed".

## Technical design

- `src/physics/colliders.ts`:
  - `ColliderWorld` with `addBox(mesh, kind)`, which stores the inverse world matrix, half-extents and a bounding sphere for a quick distance check, and `addCylinder(x, z, baseY, heightM, radiusM, kind)`, which goes into a 16 m grid.
  - `query(position, radiusM, out): boolean` writes `kind`, `normal`, `depth` into a reused `CollisionHit` (no allocation in the loop).
  - Pure geometry, no game rules.
- `src/physics/resolve.ts`: `resolveDrone(flight, world, groundY): CollisionResult` applies ground, water and obstacle rules and returns `{ crashed: boolean; reason?: CrashReason }`.
- World builders (`world/gates.ts`, `world/scenery.ts`) register shapes as they create meshes, so visuals and colliders never drift apart.
- Crash and respawn state lives in the game layer; the crash banner and static come from HUD and camera.

## Edge cases

- Very high speed: position is checked every frame. At top speed (28 m/s at 60 fps ≈ 0.47 m per frame), the drone can't skip a 0.3 m bar plus 0.18 m radius in normal play. If the frame rate drops below 30 fps, the step is split into sub-steps of at most 0.25 m.
- Respawn point inside an obstacle: respawn is in front of the gate along the track line, which is always clear.
- Crash during countdown: not possible (input locked).

## Acceptance criteria

- [ ] Hitting each obstacle type fast crashes with the right reason.
- [ ] Slow touches bump without crashing.
- [ ] Gentle landing on the ground is safe; fast impact crashes.
- [ ] Touching the lake always crashes.
- [ ] Respawn faces the next gate at the last passed gate.
- [ ] R resets instantly.

## Implementation notes (M4)

- `physics/resolve.ts` takes a minimal `Body` (position, velocity) and an injected surface query, so `physics/` never imports `world/` or `drone/`. `substepCount` splits a frame into sub-steps of at most 0.25 m.
- Ground friction is time-based (`0.85` per 1/60 s) so it does not depend on frame rate.
- The vertical descent rate is capped at 5 m/s by the flight model, so a pure vertical dive never crashes. Ground crashes come from flying into rising terrain at over 8 m/s.
- Crash freezes the drone for 1.6 s, then respawns just past the last gate, facing the next. Pre-gate respawns use the pad (free flight); the time-trial start position comes with M6.
- Verified in the browser with scripted flights (dev-only `debugSimulate`): gate frame at speed crashes ("gate"), factory roof crashes ("factory"), lake touch crashes ("water"), gentle descent lands safely.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `query` a point inside a unit box | Hit, depth > 0 | Unit |
| 2 | `query` a point 1 m outside | `null` | Unit |
| 3 | Fly into a tree at full speed | "Hit a tree" crash, respawn at last gate | Manual |
| 4 | Drift into a gate post at walking pace | Bounce, no crash | Manual |
| 5 | Descend onto grass with Shift | Lands safely | Manual |
| 6 | Dive into the ground with W + Shift at speed | "Hit the ground" crash | Manual |
| 7 | Touch the lake | "Splashed into the lake" crash | Manual |

## Out of scope

Damage model, broken props, physics debris, drone-to-drone collisions (later phases; live races use ghosted drones).

## Changelog

- 2026-11-01: Created.
