# Feature: Glacier Pass

Status: In progress (built, needs playtest)
Phase: 6
Branch: `feat/phase-6d`
Last updated: 2026-11-14

## Summary

An alpine map: a snowy mountain pass with pine forest, a rock arch, a ridge crossing where the wind shoves you sideways, a tight canyon with high walls, a frozen lake and a ski lodge. The new idea is **wind**. Step D of `maps-roadmap.md`.

## Player experience

- Menu: Maps, then "Glacier Pass". Own laps, leaderboard, ghosts and rooms.
- Bright cold daylight, white peaks, blue shadows.
- The lap: start by the lodge, north up the valley floor, through the rock arch, climb through the pines, cross the exposed ridge (cross-wind), over the pass top (strongest gusts), drop into the canyon (channelled gusts, walls 60 m high), out over the frozen lake, back past the lodge.
- **Wind:** gusts push the drone sideways. Where it blows is marked by streaks of blowing snow, and a small wind gauge shows the direction (relative to your heading) and strength. It is steady enough to learn and gusts enough to need attention.
- **Wind setting:** Settings has Wind on or off. It applies to Free flight and Training only. Time trial, Battery Challenge and live races on this map always have wind, so times stay comparable.

## Layout (metres, +X east, +Z south)

- World 1000 by 1000 (±500), ceiling 400. Terrain is a pure height function: mountains everywhere, with the race route carved through them (flat valley floor, wide ridge, narrow canyon, a flat frozen lake).
- Route widths (half-width carved): valley 30 m, ridge 50 m, canyon 9 m with walls rising to 60+ m within 25 m, lake basin 90 m.
- Rock arch (solid) across the valley, 12 m wide opening. Ski lodge (solid) by the start. About 600 pines (solid) on the lower slopes. A lake of ice (flat, not water).

## Wind

- `WindField`: zones with a centre, radius, direction, strength (m/s², up to about 3) and a gust period. Strength inside a zone is smoothed to zero at the edge; gusts vary between 65% and 100% on a sine of the shared clock, so everyone in a live room feels the same wind. Pure and tested.
- `FlightModel.step` takes the wind as an extra acceleration. The drone's drift assist still bleeds sideways speed, so the pilot counters the gust with the stick, as with a real crosswind.
- Zones: valley (light), ridge (cross-wind, medium), pass top (strong, long gusts), canyon (channelled along its axis), lake (light, fast gusts).

## Track

12 gates, about 1.53 km, 60 to 80 s a lap. The route has no U-turn at the start: the start gate sits on the valley floor at (0, 240) and the return loops south of it before coming back north. 0 start, 1 valley, 2 rock arch, 3 pine climb, 4 ridge (wind), 5 pass top (wind), 6 canyon entrance, 7 canyon bend, 8 canyon exit, 9 lake, 10 lake exit climb, 11 lodge approach.

## New systems

- Terrain from a height function with a carve (`world/glacier/terrain-fn.ts`), shared by the mesh, the physics and the track clearance.
- Wind field, wind gauge on the HUD, blowing-snow streaks.
- Alpine atmosphere: sun 38 degrees up, cold white light, pale blue fog, snow bounce light.

## Free-plan budget

No server change. One more world version (104).

## Edge cases

- Wind on respawn: the drone starts at rest at the gate; wind is mild at all gates except the pass top.
- Wind and ghosts: ghosts replay positions, so they are unaffected; they were recorded in the same field.
- Wind off in Free flight only; a time trial started from the menu always has wind.

## Acceptance criteria

- [ ] Same mountain for everyone (pure function, test).
- [ ] The route never touches terrain or solids, and the canyon walls stay clear of the line (test).
- [ ] Wind is deterministic and zero outside the zones (test); drone drifts downwind and can be flown against it.
- [ ] All 12 gates flyable in order.
- [ ] Wind gauge and streaks show the wind.
- [ ] Draw calls under 250; 55+ fps on Medium on your GPU.

## Test cases

| # | Steps | Expected | Type |
|---|---|---|---|
| 1 | Height function twice | Identical | Unit |
| 2 | Terrain along the route | Never above the route minus clearance; canyon walls rise beside it | Unit |
| 3 | Wind at a zone centre, edge, outside, over time | Strength, smooth falloff, zero outside, gusts within 65 to 100% | Unit |
| 4 | Flight with and without wind | Drifts downwind | Unit |
| 5 | Settings: wind off in free flight, time trial still windy | As described | Unit |
| 6 | Fly a lap | All gates, wind noticeable on the ridge and pass | Manual |

## Implementation notes (what was built)

- Map family `glacier` (world version 104), `alpine` atmosphere: sun 38 degrees up, exposure 0.5, pale blue haze.
- Terrain is `glacierHeight(x, z)`: mountains (noise plus ridges, taller toward the edge) blended with the route floor by distance to the route polyline, so the floor, walls and lake all come from one function. One vertex-coloured mesh (300 by 300 cells, about 180,000 triangles) with snow above a wobbling snow line, rock on steep slopes, ice on the lake.
- Wind is applied as air movement: the drone is carried by `wind m/s = strength x 2.2` and the drift assist does not fight it, so the pilot steers into it. The wind setting (Settings) only affects Free flight and Training; time trial, Battery Challenge and live races always have wind. Zones and gusts follow the shared clock.
- HUD: a wind gauge (arrow relative to the nose, speed in your units), shown on maps with wind. Blowing-snow streaks mark each zone.
- 650 pines (two solid cylinders each), a rock arch and a lodge (solid boxes).
- Tests: the terrain function (deterministic, route floor, walls beside the canyon, lake), the track (never touches the arch, lodge or a pine; 1.8 m above the ground; 4 m clear sideways), the wind field (zero outside, direction, falloff, gust range, cap), and the setting. A browser run with wind off crossed all 12 gates.

### Not built / not verified

- Not built: snowfall, avalanches, lodge details (windows, chimney smoke), updrafts, a harder wind mode.
- Not verified: how strong the wind feels (zone strengths 1.2 to 3.4 are first guesses), whether the canyon is flyable at speed, the 180,000 triangle terrain on a mid-range GPU, brightness of the snow on your screen, a human lap.
- A browser run with wind on drifts the straight-line test flights off the gates, as it should.

## Out of scope

Avalanches, snowfall, skiing characters, night version.

## Changelog

- 2026-11-14: Created.
