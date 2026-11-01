# Feature: World and Environment

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M3)
Last updated: 2026-11-01

## Summary

The valley the player flies in: terrain, lake, sky, lighting, fog, clouds, the old factory, the pit area, trees, rocks and wind-blown grass. Generated from deterministic noise so every player gets the same world with no large downloads.

## Player experience

A golden-hour valley: green rolling hills near the track, rocky slopes and snowy peaks around the edge, a calm lake, pine forests and broadleaf trees, grass moving in the wind, long soft shadows, warm haze in the distance, and a few soft clouds.

## Behavior and rules

- **Size:** terrain 2.6 km × 2.6 km, centred on the origin. Flyable area is the valley; the mountain ring is scenery.
- **Determinism:** all noise uses a fixed integer hash, so `heightAt(x, z)` returns the same value for every player and every load. Random placement (trees, rocks, grass) uses a seeded random generator, never `Math.random()`.
- **Zones:**

| Zone | Location | Notes |
|---|---|---|
| Valley floor | Within ~150 m of the centre | Gentle hills so the track stays low |
| Mountain ring | Beyond ~460 m | Steep, rocky, snow above ~175 m |
| Lake | Centre (−40, 74), radius 44 m | Water surface 2.2 m below the surrounding ground |
| Old factory ("bando") | (112, 100) | Ground flattened to radius ~24–42 m |
| Pit area | Next to the start gate | Landing pad, tent, table, containers |

- **Terrain colors** blend by noise, slope and height: grass (two greens), dry grass, mud near water, rock on slopes over ~35°, snow on high flat areas.
- **Lighting:** sun at 15° elevation, warm color, one shadow-casting directional light that follows the camera focus. Sky dome (Three.js `Sky`), image-based lighting from the same sky, warm exponential fog.
- **Hamlet:** a small cluster of 8 houses (gabled roofs, windows) near (40, -30), at least 22 m from the track. They give the player familiar objects of known size to judge speed and height against. They are solid obstacles ("Hit a building").
- **Vegetation:** about 3,400 pines and 900 broadleaf trees (instanced), kept off the track (≥ 12 m), the lake, the factory and the pit area. About 500 rocks. Up to 70,000 grass blades near the track and pits, swaying in the wind.
- **Quality presets** (from `config.ts`): Low hides grass and shadows; Medium and High show them.

## World boundary

- The flyable area is ±900 m around the centre, up to a 300 m ceiling (`WORLD.bounds`). The terrain mesh itself extends to ±1,300 m, so the wall is always inside it and the void beyond the terrain is never reachable. The highest peak stays at least 30 m under the ceiling (unit test).
- `physics/bounds.ts` (`clampToWorld`) stops the drone at the wall and removes only the outward speed. `world/boundary.ts` draws a faint grid (25 m cells, one-pixel lines, 30% max opacity) on the four walls and ceiling; it fades with distance to the drone, so it is invisible from afar.

## UI

None (world only).

## Technical design

- `src/core/math.ts`: `hash2`, `valueNoise`, `fbm`, `smoothstep`, `clamp`, seeded `createRng(seed)`.
- `src/world/terrain.ts`: `heightAt(x, z)`, `groundY(x, z)` (terrain or lake surface), `buildTerrain(scene, textures)`, `buildWater(scene)`. Lake and factory constants come from `config.ts` (`WORLD.lake`, `WORLD.bando`).
- `src/world/sky.ts`: sky dome, environment map, sun light, fog; `followFocus(position)` moves the shadow camera; `setShadowExtent(m)`.
- `src/world/textures.ts`: procedural canvas textures (detail noise, concrete, container ribs, checker banner, pad marking, clouds). Created once and shared.
- `src/world/scenery.ts`: factory, pit area, containers, vegetation, rocks, grass, clouds. Registers collision shapes with `physics/colliders.ts` (see collisions-and-crash).
- All repeated objects use `InstancedMesh`; geometries and materials are shared.

## Edge cases

- Low-end GPU: Low preset removes grass and shadows; terrain and trees still render.
- Window resize: renderer and post-processing resize; world unchanged.
- Determinism break: any change to noise or seeds changes the world and invalidates leaderboard times. Such changes need a world version bump (`WORLD.version`) and a note in this doc.

## Acceptance criteria

- [ ] The valley matches the approved preview's look (terrain, lake, factory, pits, trees, grass, sky).
- [ ] `heightAt(x, z)` returns identical values across reloads.
- [ ] No trees or rocks within 12 m of the track centre line, in the lake, in the factory or on the pit area.
- [ ] 60 fps on Medium at 1080p on a mid-range laptop; under 150 draw calls.
- [ ] Low preset visibly removes grass and shadows.

## Implementation notes (M3)

- Modules: `world/{terrain,sky,textures,track,scatter,containers,pit-area,factory,houses,vegetation,grass,clouds,scenery}.ts`, `physics/colliders.ts`.
- `ColliderWorld.query(position, radius, out)` writes into a reused `CollisionHit` instead of returning an object, so the game loop allocates nothing. Kinds: `gate`, `factory`, `container`, `building`, `tree`.
- `track.ts` is built here (not in M4) because trees, rocks and houses must stay clear of the racing line. `PIT_PAD` (spawn and battery pad) is derived from the start gate.
- Textures use the seeded generator, so every player sees identical pixels. The preview used `Math.random()`.

## Status after M3

Built and checked in a headless browser: terrain, lake, sky and lighting, factory with containers, pit area (pad, tent, table, containers), 8-house hamlet, instanced pines and broadleaf trees, rocks, wind-blown grass, clouds.

Measured (software renderer, Medium-equivalent settings): **68 to 81 draw calls** depending on the view, about **1.34 M triangles** per frame. Not yet measured on a real GPU: the 60 fps target is checked in M8. Remaining for later milestones: Low/Medium/High quality presets (M7).

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Call `heightAt(100, -50)` twice in separate page loads | Same value | Unit |
| 2 | Fly the full track in chase camera | No tree or rock blocks the racing line | Manual |
| 3 | Look at the lake edge from 5 m up | Water meets the shore with no gaps or floating edges | Manual |
| 4 | Settings → Low | Grass and shadows disappear; frame rate rises | Manual |
| 5 | Check `renderer.info.render.calls` on Medium | Under 150 | Manual |

## Out of scope

Real CC0 textures, HDRI sky, glTF tree and rock models, LOD (Phase 2). Weather and time of day (later).

## Changelog

- 2026-11-01: Created.
- 2026-11-01: M3: added the hamlet (houses with windows) as scale references; added `building` collider kind.
