# Feature: Harbor Run

Status: In progress (built, needs playtest)
Phase: 6
Branch: `feat/phase-6c`
Last updated: 2026-11-14

## Summary

The third map family: a container port at golden hour. Open water you can skim (and splash into), a container yard with narrow aisles, a moored cargo ship with a tunnel through its cargo, two gantry cranes whose hooks swing across the route on a timer, a warehouse you fly through, and a lighthouse. Step C of `maps-roadmap.md`.

## Player experience

- Menu: Maps, then "Harbor Run". Own best laps, leaderboard, ghosts and live rooms.
- Warm low sun, long shadows, orange haze, glittering water.
- The lap: start on the quay, under crane 1 (timed hook), into a container aisle, around the top of the yard, down a second aisle, under crane 2 (timed hook), over the stern of the ship and through the tunnel in its cargo, a low run over the open water, through the warehouse on the west pier, and back to the quay.
- **Water:** touching it is a crash with a splash. Flying low and fast over it throws a spray behind you. The same splash now plays on the valley lake.
- **Cranes:** each trolley carries a container that slides across the route on a 14 second cycle. It blocks the line only about a fifth of the time, so you can time it or go round.

## Layout (metres, +X east, +Z south, water level 0, quay top 1)

- World 720 by 720 (±360), ceiling 130. Hard boundary grid as in the other maps.
- **Land:** the yard and quay (everything north of z = -120), plus two piers: east pier x 150 to 190, z -120 to 120; west pier x -190 to -150, z -120 to 60. Everything else is water.
- **Container yard:** blocks of stacked containers, 24 by 15.6 m, 2 to 5 levels high, in a grid with a 14 m aisle at x = -20 and at x = 110, and an east to west aisle along z = -262. The quay lane (z = -137 to -121) is kept clear.
- **Ship:** hull x -70 to 70, z -114 to -90, 9 m high. Cargo stack x -45 to 45, 24 m high, with an 8 by 6 m tunnel through it along x. Bridge tower on the east end.
- **Cranes:** at x = -130 and x = 100. Four solid legs (26 m apart in x, 12 m in z), a beam along z at 38 m, a trolley that slides along it, a hanging container (12 by 2.6 by 2.6 m) with its bottom at 5 m.
- **West pier warehouse:** 30 by 60 m, 14 m high, with an 8 by 5 m tunnel along x.
- **Lighthouse** at the harbor mouth (z = 320) and a breakwater with a gap.

## Track

12 gates, about 1.07 km, 45 to 60 s a lap (the line is shorter than the city's; the cranes add waiting). Gates: 0 start on the quay, 1 quay run, 2 crane 1 (timed), 3 aisle 1, 4 aisle 1 top, 5 yard top, 6 aisle 2, 7 crane 2 (timed), 8 ship tunnel in, 9 ship tunnel out, 10 low water run, 11 warehouse tunnel.

## New systems

- **Water effects** (`world/water-effects.ts`): droplet particles for a splash on a water crash and a wake while skimming. One instanced mesh, no allocation per frame. Used on every map with water.
- **Moving hazards** (`harbor/crane-plan.ts`): crane trolley and hook positions are a pure function of a shared clock, with a dynamic collider each (like the traffic).
- **Shared clock** (`core/shared-clock.ts`): moving hazards (cranes, and now the city traffic) read the wall clock instead of each player's own timer, so everyone in a live room sees the same crane and the same traffic to within the device clock error.
- **Dusk atmosphere** (`config.ts`): low orange sun, warm fog.

## Free-plan budget

No server change. One more world version (103), so its laps are separate rows.

## Edge cases

- A drone over the quay edge: land is 1 m above water; the ground rule handles the step.
- Hook over the respawn point: respawns are at a gate, which is clear of the hook except gates 2 and 7 (those respawn 2 m past the gate).
- Clock skew between players: up to a second or two of crane phase difference. Accepted.

## Acceptance criteria

- [ ] Same harbor for everyone (seeded plan, test).
- [ ] The line never touches a static solid, and each crane blocks it under a third of the time with no block longer than 3 s (tests).
- [ ] Water crash splashes; skimming leaves spray.
- [ ] All 12 gates flyable in order (synthetic lap).
- [ ] Draw calls under 250; 55+ fps on Medium on your GPU.

## Test cases

| # | Steps | Expected | Type |
|---|---|---|---|
| 1 | Build the plan twice | Identical | Unit |
| 2 | Spline against every static box | No contact (1.2 m margin) | Unit |
| 3 | Crane cycle against the route | Blocked under 30% of the time, no block over 3 s | Unit |
| 4 | Land test | Quay and piers are land, the basin is water, edges consistent | Unit |
| 5 | Fly into the water | Crash with a splash | Browser |
| 6 | Fly a lap | All gates in order | Manual |

## Implementation notes (what was built)

- Map family `harbor` (world version 103) with a `dusk` atmosphere: sun 5 degrees up, orange light, warm fog.
- Land and water come from `HARBOR.land` rectangles (`isLand`); `terrain.ts` answers height and water from it, so the existing water crash rule works unchanged.
- Yard blocks, ship, warehouse and crane frames are boxes from a seeded plan, merged into two meshes (ribbed containers and plain concrete). Colliders come from the same boxes. Crane trolley, cable and hanging container are dynamic colliders driven by `craneState` on the shared clock.
- Route: 1.07 km, minimum corner radius 12 m. Tests check it never touches a static solid (1.2 m margin), stays 1.8 m above ground or water, and that each crane blocks the line under 30% of the time with no block over 3 s. A browser run crossed all 12 gates in order.
- `core/shared-clock.ts` is now also used by the city's traffic and wildlife, so live-room players see the same vehicles.
- Water crash splashes (droplets and a ring); a fast low pass leaves spray. It also plays on the valley lake.

### Not built / not verified

- Not built: gulls, boats that move, deck details and windows on the ship, light poles on the quay, a harbor-specific Battery Challenge par table.
- Not verified: how the lap feels, whether the 8 by 5 m ship tunnel and 9 by 8 m warehouse tunnel are the right size, whether the 14 second crane cycle is fair, frame rate on your GPU, and water colour in motion.
- Water is a flat plane with a drifting ripple map (no waves), so the surface does not move under a low drone.

## Out of scope

Boats that move, tides, wind (Glacier Pass), night variant.

## Changelog

- 2026-11-14: Created.
