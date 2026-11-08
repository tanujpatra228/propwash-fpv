# Feature: Downtown Dash: Night, and the map screen

Status: In progress (built, needs playtest)
Phase: 6
Branch: `feat/phase-6b`
Last updated: 2026-11-08

## Summary

The city after dark, as a third map, plus a map screen with a card for every map. First step of `maps-roadmap.md`.

## Player experience

- Menu entry **Maps** opens cards (picture, one line, your best lap on that map). Picking another map reloads into it. All maps are open from the start.
- **Downtown Dash: Night** is the same city and the same line as the day map, with its own best laps, leaderboard, ghosts and rooms.
- After dark: a navy sky with stars and a moon, a dim blue moonlight, glowing windows (about 40% lit, in warm tones, different on every building), neon signs on the taller buildings, street lamps with soft pools of light, and headlights and tail lights on the traffic. Gates stay bright orange.
- Street lamps (poles and heads) also stand along the avenues in the day map.

## How it works

- A **map** is a world family (`valley` or `city`) plus an atmosphere. `TRACK_DEFS` in `config.ts` gives each map its family, a night flag, a name, a blurb, and its own world version (night is 102, so its laps are kept apart without a database change).
- `RENDER` in `config.ts` is the atmosphere of the active map: `ATMOSPHERE_DAY` or `ATMOSPHERE_NIGHT` (light colour and direction, exposure, fog, sky). Night is the sky dome below the horizon, a moon as the one shadow-casting light, and low hemisphere light so the buildings stay readable.
- `world/stars.ts`: navy gradient dome, 1,500 stars, a moon disc. The stock sky dome is hidden at night because it goes pure black.
- `city/buildings.ts`: at night the facade material gets an emissive window mask and a small shader hook. Each window (a bay by a floor, found from its world position) gets a hash, and only some are lit.
- `city/street-lamps.ts`, `city/neon-signs.ts`, and light bars in `city/traffic.ts`: all instanced, no real light sources, so no extra lighting cost.
- `ui/map-select.ts`: the cards, with pictures drawn as inline SVG (no image files).

## Free-plan budget

No server change. The only online effect is one more world version (laps of the night map are separate rows).

## Edge cases

- A link or saved choice with an unknown map falls back to the valley.
- Clouds are not built at night (they would glow white).
- Birds and pedestrians are hidden on the lowest graphics preset, as in the day map.

## Acceptance criteria

- [x] Map screen lists all maps and switches between them (browser check).
- [x] Night map loads, same line and plan as the day map, own world version (unit tests).
- [ ] Readable on your screen: gates and the next-gate marker are easy to see.
- [ ] 55+ fps on the Medium preset on your GPU.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Load `?track=night` | Night atmosphere, version 102, same plan and length as the city | Unit |
| 2 | Maps screen, pick Night | Page reloads into the night city, choice remembered | Browser |
| 3 | Fly a lap at night | All 12 gates readable and flyable | Manual |
| 4 | Race a friend in a night room | Both on the night map | Manual |

## Changelog

- 2026-11-08: Created with the build.
