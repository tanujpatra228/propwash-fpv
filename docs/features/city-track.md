# Feature: City Track ("Downtown Dash")

Status: In progress (built, needs playtest)
Phase: 6
Branch: `feat/phase-6`
Last updated: 2026-11-08

## Summary

A second track set in a city: streets with moving traffic, glass-and-concrete towers, buildings you fly through, a park with a pond and birds, rooftop gates, and other drones sharing the airspace. Same flight model, same modes (free flight, time trial, training, battery challenge, live races), different world. Players choose the track in the menu.

## Player experience

- Main menu has a **Track** selector (Valley Sprint, Downtown Dash). Choosing the other track reloads the game into it (about 2 seconds) and remembers the choice.
- The city is daytime, busy and tight. You thread avenues, dive under a skybridge, cut through a tower via a "window" portal, skim the park, climb over a rooftop and finish back on the main avenue.
- Moving cars, buses and trucks run on the streets. They are solid: clip one and you crash.
- A flock of birds wheels over the park and drifts between towers. They are scenery only.
- AI delivery drones cruise above the avenues. They are scenery only (they do not collide), so they never ruin a lap.
- Leaderboards, best laps, ghosts and live rooms are **per track**.

## Layout (coordinates in metres, +X east, +Z south, same axes as the valley)

- Playable area 640 by 640 (±320). A hard boundary like the valley's grid marks the edge.
- A street grid: **avenues** 28 m wide every 120 m along both axes (centre lines at -240, -120, 0, 120, 240), blocks 92 m square. Sidewalks 4 m inside each block edge.
- Blocks are filled from a seeded plan (same city for everyone, deterministic):
  - **Towers** 60 to 110 m, glass and concrete faces with window grids. A few have setbacks (a smaller upper box).
  - **Mid-rise** 25 to 55 m.
  - **Low** 10 to 20 m (shops, parking).
  - **Park block** (one, centre-east): grass, a pond, trees, paths, a bandstand. No tall buildings: this is the relaxed section of the lap.
  - **Plaza block** (start/finish): open paving, the start gate on the main avenue.
- **Window portals:** 5 chosen buildings have a rectangular tunnel through them (6 m wide, 4.5 m high, at floor 3 to 6). A portal is a flyable hole: the building is built from collider boxes around it. Two of the five are race gates.
- **Skybridge:** a covered glass bridge between two towers, with a flyable gap under it.

## Track

12 gates (the live-room and challenge logic assume 12, so both tracks have 12). Closed loop, about 1.4 km, 55 to 70 seconds a lap at racing pace.

Gate order (first draft, tuned after flying it):

1. Start/finish on the main avenue (plaza)
2. Down the avenue, under the skybridge
3. Left turn at the first intersection
4. Window portal A (tower 1)
5. Rooftop arch over a mid-rise (climb)
6. Dive to street level, weave between buses
7. Into the park, low over the pond
8. Park exit through a gap between trees and buildings
9. Window portal B (tower 2)
10. Up the side of a tower, over its setback
11. Long diagonal across the avenue intersection, over the traffic
12. Return to the plaza

Gates are the same objects as the valley's (frame, LEDs, banner), placed on the spline.

## Traffic and life

| Thing | Behaviour | Solid? |
|---|---|---|
| Cars, vans, buses | Follow lane loops along the avenues at 6 to 14 m/s, stop and go at intersections on a fixed timer, evenly spaced, deterministic from a seed and the clock | Yes: one moving collider per vehicle, crash kind `vehicle` |
| Pedestrian dots | Tiny coloured shapes on sidewalks (instanced), purely visual | No |
| Birds | 40 birds as one instanced flock: a boid-like wheel around the park plus a few drifting between towers, flapping wings by vertex animation | No |
| Delivery drones | 6 AI drones on rails over the avenues at 15 to 25 m height, blinking lights | No |
| Park | Trees, benches, a pond with a water plane, a fountain | Trees solid, benches no |

All motion is computed from the clock (`positionAt(timeS)`) with no per-frame allocation. Vehicles are updated once per frame and their colliders moved with them (dynamic boxes in `ColliderWorld`).

## Architecture decision: one track per page load

The valley's code reads its world from module-level singletons (terrain height, the track spline, bounds). Rather than rewrite all of that into swappable objects, the **active track is chosen at start-up** (from `localStorage` or `?track=`), and every world module reads it once. Switching tracks reloads the page. Benefits: no memory for the unused world, no swap bugs, all existing code keeps working. Costs: about 2 seconds to switch, and a live room's track must match yours (the room link carries the track, and joining the wrong one offers to switch).

- `config.ts` gets `TRACKS` (id, name, world version, bounds, start point) and `CITY` (layout, traffic, birds).
- `world/active-track.ts` exports `ACTIVE_TRACK` and `trackInfo`.
- `terrain.ts` functions (`heightAt`, `groundY`, `surfaceAt`) answer from the city ground (flat, plus road and park surfaces) when the city is active.
- `world/track.ts` builds the spline from the active track's control points.
- `world-setup.ts` builds the valley or the city.
- Storage keys and the leaderboard are per track.

## Online and free-plan budget

- **D1:** add a `track` column to `laps` (migration 0002, default `'valley'`), the leaderboard and ghost endpoints filter by track. One extra small column: no change to row counts or daily reads/writes beyond the existing Phase 4 budget (a second track at most doubles lap submissions, still far under 100k writes/day).
- **Rooms:** the room stores its track; joining with a different track is refused with a clear message. No extra Durable Object requests.
- **Assets:** the city is procedural (generated textures and instanced geometry), so no new downloads, and the page size does not grow.
- **Workers requests:** unchanged: only API calls hit the Worker.

## Technical design

- `src/world/city/plan.ts` (pure, seeded): the block plan, building list, portal list, road centre lines. Unit tested (no overlaps, portals inside buildings, deterministic).
- `src/world/city/buildings.ts`: instanced or merged building meshes with a generated window texture; colliders from the plan (portal buildings from boxes around the opening).
- `src/world/city/roads.ts`: ground, road and sidewalk surfaces, lane markings, crosswalks.
- `src/world/city/park.ts`: grass, pond, trees (reusing the valley tree builders), fountain.
- `src/world/city/traffic.ts`: vehicle lanes and signal timing (pure `vehicleStateAt(timeS)`), instanced vehicle meshes, dynamic colliders.
- `src/world/city/life.ts`: birds, pedestrians, delivery drones.
- `src/world/city/city-track.ts`: control points and gate placement.
- `src/physics/colliders.ts`: dynamic boxes (`addDynamicBox` returns a handle with `setTransform`).
- `src/ui/track-select.ts` and a menu entry showing the active track and best lap.
- `src/ui/minimap.ts`: draws the city map (blocks, avenues, park, pond) when active.

## Edge cases

- Reload loop: the selected track is only changed by the player; an invalid saved value falls back to the valley.
- Vehicle spawns inside a drone: vehicles pass through the drone's respawn point harmlessly (respawn checks for a vehicle within 6 m and nudges forward).
- Low-end GPUs: windows are one shared texture, buildings are merged per block, traffic and birds are instanced; the quality presets scale bird, pedestrian and vehicle counts.
- A crash into a moving vehicle freezes as usual and respawns at the last gate.
- Leaderboard of the other track is not shown; the leaderboard screen has a track switch for viewing only.

## Acceptance criteria

- [ ] Track selector in the menu switches the world and remembers the choice.
- [ ] City is generated identically on every machine (seeded plan, verified by a hash in a test).
- [ ] No building overlaps a gate or the start; portals are flyable and solid around the opening.
- [ ] 12 gates flyable in order; a lap takes 55 to 70 seconds at racing pace (measured with the synthetic flight).
- [ ] Vehicles move, stop at intersections and are solid; birds and drones animate.
- [ ] Best laps, ghosts, leaderboard and live rooms are separate per track.
- [ ] 55+ fps on the Medium preset on the user's machine; draw calls under 250.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Build the plan twice | Identical (same hash) | Unit |
| 2 | Check every building against gate volumes | No overlap | Unit |
| 3 | Portal collider boxes | Opening is clear, walls solid | Unit |
| 4 | `vehicleStateAt(t)` | Deterministic, spaced, stops on red | Unit |
| 5 | Fly a synthetic lap | Completes, 55 to 70 s | Unit |
| 6 | Switch track in the menu | Page reloads into the other world, choice kept | Manual |
| 7 | Fly into a bus | Crash with the vehicle message | Manual |
| 8 | Race a friend on the city in a live room | Both in the city, results correct | Manual |

## Implementation notes (what was built)

- **Track selector:** menu entry "Track"; switching saves the choice and reloads. `?track=city` in a link overrides the saved choice for that visit. Invite links for rooms include the track.
- **World:** seeded plan with 4 by 4 blocks of 4 lots, 6 portal buildings (two form the route's tunnel through a whole block), a skybridge between two 78 m towers, a plaza and a park with a pond and 46 solid trees. All buildings are merged into one mesh (one draw call); colliders come from the same boxes.
- **Track:** 12 gates placed by hand along a 1.37 km line (anchors in `config.ts`), minimum corner radius about 14 m. A test checks the line never touches a building (1.2 m margin) and stays in the world.
- **Traffic:** about 280 vehicles in 3 instanced types. Each axis of avenues moves exactly one block per 18 s green and waits; stopped vehicles never rest in a junction (tested). Each vehicle has a moving collider (`vehicle` crash).
- **Life:** 42 birds (park flock circling, tower flock weaving), 6 delivery quadcopters on the avenues, 160 pedestrians on the sidewalk rings. None is solid. The lowest graphics preset hides birds and pedestrians.
- **Online, per track:** laps carry their `track`; the server validates against that track's start, bounds and world version, keeps separate rows and leaderboards (the world version differs per track, so no migration was needed), and a ghost response names its track so a link from the other track reloads into it. Live rooms take the track of the pilot who opens them; others are told to switch. Best laps and challenge records are stored per track.
- **Budget:** unchanged. No new assets, no new tables, no extra Worker requests beyond Phase 4 and 5.

### Not built yet / not verified

- Not built: street lights and signs, traffic lights drawn at junctions, minimap markers for traffic, a rooftop gate, window frames with LEDs on the portals, per-track Training lessons (Training uses the current track unchanged).
- Not verified: a human flying a full lap (the 55 to 70 s target comes from the line length), frame rate on the user's GPU, how the colours and fog look at different times, and portal width feel (8 by 5 m).
- Known rough edges: the facade texture is one tile, so buildings repeat; ground and horizon colours need tuning; the minimap does not show the buildings' heights.

## Out of scope

Day and night, weather, destructible objects, pedestrians that react, vehicles you can follow, a city track editor (Phase 6 later).

## Changelog

- 2026-11-08: Created.
