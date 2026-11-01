# Feature: Height Indicator

Status: Planned
Phase: 1
Branch: `feat/height-indicator`
Last updated: 2026-11-01

## Summary

Always shows how high the drone is above the ground, so new pilots can judge distance. A height gauge on screen in both cameras, plus a ground line under the drone in the chase camera.

## Player experience

- Bottom-left of the screen: a "HEIGHT" box with a big number (for example **2.4 m**) and a vertical bar that fills as the drone climbs.
- The color tells you at a glance: green when safe, yellow when getting low, red when about to touch.
- In the chase camera, a dashed line drops from the drone to the ground with a ring where it meets the ground, in the same color.

## Behavior and rules

Values in `config.ts` → `HUD.height`.

| Rule | Value |
|---|---|
| Height | Drone position − `groundY(x, z)` − 0.1 m (rest offset), never below 0 |
| Ground | Terrain height, or the lake surface when over the lake |
| Display | One decimal below 10 m (`2.4 m`), whole metres from 10 m (`23 m`) |
| Colors | Green ≥ 2 m, yellow 0.6–2 m, red < 0.6 m (CSS tokens `--ok`, `--warn`, `--bad`) |
| Bar scale | Square-root scale to 30 m, so the low range has more detail |
| Update rate | Text every 3rd frame; ground line every frame |
| Ground line | Chase camera only; dashed (0.22 m dash, 0.16 m gap); ring radius 0.26–0.34 m at ground + 0.04 m |

- Shown during free flight and time trial, in both cameras. Hidden in menus.
- The OSD in goggles view does not repeat the height (the gauge is the single height display).

## UI

- `#height-gauge` panel: bar on the left, "HEIGHT" label, value with a smaller "m".
- Sits bottom-left, clear of the help bar (bottom centre) and minimap (bottom right).

## Technical design

- `src/world/terrain.ts`: `groundY(x, z)` (shared with collisions and crash checks; not re-implemented).
- `src/core/format.ts`: `formatHeight(m)`.
- `src/ui/height-gauge.ts`: DOM gauge; `update(heightM)` sets text, bar height and state class.
- `src/ui/ground-marker.ts`: one `Line` with `LineDashedMaterial` and one ring mesh, created once; `update(dronePos, groundY, state, visible)`; positions updated in place (no allocations).
- Thresholds read from `config.ts` and shared by both so colors always match.

## Edge cases

- Over the lake: measures to the water surface.
- Inside the factory: measures to the floor (factory floor = flattened terrain).
- Above the factory roof: Phase 1 measures to the floor below; roof-aware height is Phase 2.
- Landed: shows 0.0 m in red.

## Acceptance criteria

- [ ] Gauge visible in both cameras during flight; hidden in menus.
- [ ] Value matches the drone's real height within 0.1 m.
- [ ] Color changes at 2 m and 0.6 m, for both gauge and ground line.
- [ ] Ground line visible only in chase camera and always reaches the ground.
- [ ] Over the lake, height is measured to the water.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `formatHeight(2.44)` / `formatHeight(23.6)` | `2.4` / `24` | Unit |
| 2 | Sit on the pad | `0.0 m`, red | Manual |
| 3 | Climb slowly past 0.6 m and 2 m | Yellow at 0.6, green at 2 | Manual |
| 4 | Switch to chase, hover at 5 m | Dashed line to the ground, white ring | Manual |
| 5 | Hover 2 m over the lake | Shows about 2 m (water, not lakebed) | Manual |

## Out of scope

Roof-aware height on top of buildings, audio low-height warning (Phase 2).

## Changelog

- 2026-11-01: Created. Requested by the product owner; design approved in the preview artifact.
