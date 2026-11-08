# Plan: New Maps

Status: Proposed (waiting for approval)
Phase: 6
Last updated: 2026-11-08

## Where we are

Two maps: **Valley Sprint** (nature) and **Downtown Dash** (city). The map system already works: one map per page load, chosen in the menu, with per-map best laps, leaderboards, ghosts and live rooms. Adding a map is now mostly data and a world builder, not new plumbing.

## Principles for every new map

1. **A different way to fly, not a re-skin.** Each map adds one new thing to think about (wind, moving hazards, water, darkness).
2. **Procedural, no downloads.** Generated geometry and textures, so the page stays small and the Cloudflare free plan is unaffected. Real textures replace the generated ones later, per map.
3. **12 gates, 1.2 to 1.6 km, 50 to 80 seconds a lap.** Live rooms and the lap tracker assume 12 gates. Raising that is a separate change (see prerequisites).
4. **Tested before flown.** Each map ships with: determinism test (same world for everyone), "the line never touches a solid" test, "gates in order" test, and a synthetic lap through all gates.
5. **One doc per map** in `docs/features/`, written before the code, with its free-plan note (none expected: no server changes).

## The maps, in recommended order

### 1. Downtown Dash: Night (variant of the city) — small
Same city, same line, after dark. Cheapest map we can make and the biggest visual change.
- Dark sky with a few stars, a moon light, no sun shadows; street lights and lit windows (emissive window pattern, random lit floors); neon signs on towers; vehicle headlights and tail lights; gates glow brighter (LED strips are already emissive).
- New: **time-of-day settings** (`sky` and light values per map variant) and an emissive facade texture. Both are reused by every later map.
- Own leaderboard (the variant is a separate world version). Light-pollution fog keeps draw distance low, which helps performance.
- Risk: readability. Mitigation: gates and the next-gate marker are bright, an optional "night assist" setting brightens the ground.

### 2. Harbor Run (docks and water) — medium
A container port at golden hour: stacks, gantry cranes, a moored ship, open water with piers.
- **New mechanic: water.** Skimming low over water leaves a wake effect; touching it is a crash (the valley lake already supports water crashes).
- **New hazard: moving cranes.** A gantry crane trolley slides along its beam and a hook swings on a fixed timer, using the dynamic colliders we already have. Timing the gap is the skill.
- Fly through: a gap between container stacks, under a ship's bow, inside a half-open warehouse, between crane legs.
- Reuses the container builder from the valley's factory, the water shader, and the portal idea from the city.
- Gate order: dock entrance, container canyon, crane gate (timed), over the ship deck, low water run, warehouse portal, pier chicane, return.

### 3. Glacier Pass (alpine) — medium to large
A snowy mountain pass: cliffs, an ice arch, a frozen lake, a ski lodge, pine forests, a narrow canyon.
- **New mechanic: wind.** Gust zones push the drone sideways and up or down (a vector field per zone, smooth and deterministic, shown by snow streaks and a gauge arrow). The flight model already takes forces, so wind is one extra vector.
- Big height changes (400 m ceiling), long fast sections and one very tight canyon.
- Built on the valley's terrain generator with a different height function, snow colours and rock walls; most of the valley code is reused.
- Risk: wind feeling unfair. Mitigation: zones are marked and the strength is mild on the first lap; a setting turns wind off for training.

### 4. Foundry (industrial interior) — large
A huge factory: indoors and out, pipes, conveyor lines, presses, a furnace hall, catwalks.
- **New hazards: timed moving machinery** (presses that slam down, rotating arms, shutters), all dynamic colliders on fixed loops so a lap can be learned.
- Tight and technical, the opposite of Glacier Pass. Low ceiling sections need careful throttle.
- Needs the most new geometry (interior shells with openings), so it comes last.

### Candidate later maps
Desert canyon (very fast, rock arches, dust), rooftops (vertical, setbacks and helipads), a night version of any map.

## What each map needs (shared work, done once)

| Prerequisite | Needed by | Size |
|---|---|---|
| Map registry: one `MapDef` per map (name, blurb, bounds, version, gates, builder), replacing the two hard-coded branches | all | small |
| Map select screen with a picture, best lap, and your rank, instead of a text list | all | medium |
| Time-of-day / atmosphere settings per map (sky, fog, light, emissive) | Night, Harbor, Foundry | small |
| Wind field in the flight model plus a wind gauge | Glacier | medium |
| Timed moving hazard helper (loop timers driving dynamic colliders and meshes) | Harbor, Foundry | small (traffic already does this) |
| Per-map minimap drawing, via a function on the `MapDef` | all | small each |
| Per-map Battery Challenge par times and Training notes | all | small each |
| Optional: variable gate count per map (rooms and lap checks read it from the map) | only if a map wants it | small |

## Order, effort and what you will see

| Step | Result you can play | Rough effort |
|---|---|---|
| A. Map registry and select screen | Menu shows maps as cards | 1 session |
| B. Night city | A third track, same layout, completely different feel | 1 session |
| C. Harbor Run | Water, cranes, containers | 2 sessions |
| D. Glacier Pass | Wind, mountains | 2 to 3 sessions |
| E. Foundry | Moving machinery interior | 3 sessions |

After each step: merge to `main`, deploy, you play it, and we fix what you find before starting the next.

## Decisions I need from you

1. **Order:** is Night, Harbor, Glacier, Foundry right? If you would rather have wind or machinery earlier, say so.
2. **Wind:** do you want it at all? Some pilots dislike forces they cannot control. I would include a setting to turn it off.
3. **Water crash:** touching water crashes (as in the valley), or is it a harmless splash? I recommend crash.
4. **Unlocks:** all maps open from the start, or unlocked with credits (the Hangar economy)? I recommend open maps: more tracks make people stay.
5. **Real textures:** keep maps procedural for now and swap in your downloaded textures after, or wait for the textures first? I recommend procedural first.

## Risks

- **Performance:** every map has a draw-call budget (under 250) and a triangle budget; each ships with a measured number from the software test and your GPU report.
- **Scope creep:** Foundry is the one most likely to run long. It stays last and can be cut to a smaller layout.
- **Balance:** par times and credits per map are guesses until you fly them.

## Changelog

- 2026-11-08: Created.
