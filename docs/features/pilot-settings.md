# Feature: Pilot Settings (field of view, camera tilt, invert, units)

Status: In progress
Phase: 2
Branch: `feat/phase-2`
Last updated: 2026-11-01

## Summary

Four personal settings in the main menu's Settings screen: how wide the goggles view is, how far the camera tilts up, whether the mouse turn direction is inverted, and whether numbers are shown in metric or imperial units.

## Player experience

Open Settings from the menu. Under "Camera" two sliders: **Field of view** (70° to 110°, default 86°) and **Camera tilt** (0° to 50°, default 25°). Under "Mouse" an **Invert mouse turning** switch. Under "Units" a choice of **Metric** (km/h, m) or **Imperial** (mph, ft). Changes apply at once and are remembered.

## Behavior and rules

- **Field of view and camera tilt** apply to the goggles camera only. The chase camera keeps its own view. A wider field of view shows more of the world and a stronger sense of speed; a higher tilt lets you fly faster while tipped forward without staring at the ground (see the Hangar copy in the preview).
- The artificial horizon and the crosshair offset in the OSD follow the camera tilt, so the horizon line is still correct.
- **Invert mouse turning** flips left and right: moving the mouse right turns the drone left. (The mouse only turns the drone; it has no up and down axis, so there is nothing else to invert.)
- **Units:**
  - Metric: speed in km/h, height and gate distance in metres.
  - Imperial: speed in mph, height and gate distance in feet.
  - Applies to the speed gauge, the OSD speed, the height gauge and the gate marker. Physics, battery and lap times are unaffected (they are always metres, seconds and amps).
- Values are clamped to their ranges when loaded; corrupt saved data falls back to defaults.
- Saved in `localStorage` key `pw.pilot.v1`.

## UI

Settings screen sections: Graphics quality, Camera (two sliders with live values), Mouse (switch), Units (two-way choice), Battery drain in free flight. Sliders use the same style as the mouse speed slider in Controls.

## Technical design

- `src/game/pilot-settings.ts`: `PilotSettings` type, `DEFAULT_PILOT_SETTINGS`, `RANGES`, `sanitizePilotSettings` (pure), `loadPilotSettings`, `savePilotSettings`.
- `src/core/format.ts`: `formatSpeed(mps, units)`, `formatHeightUnits`, `formatDistance` take the units and return text with the unit label; the old km/h-only helpers become thin wrappers or are replaced.
- `src/game/camera-rig.ts`: goggles FOV and tilt come from settings (`setGogglesView`).
- `src/input/input.ts`: `setInvertTurn(isInverted)`.
- `src/ui/menu.ts`: new sections and a `onPilotSettingsChange` callback.
- `HudState` carries `units` and `uptiltDeg` so UI elements need no globals.

## Edge cases

- Changing the field of view while in the menu: applied when you next fly (the broadcast camera keeps its own view).
- Speed shown in mph rounds to a whole number like km/h does.
- Height under 10 m (or 33 ft) shows one decimal in either unit system; above that, whole numbers.

## Acceptance criteria

- [ ] Sliders change the goggles view live and are remembered after a reload.
- [ ] Horizon line stays level with the real horizon at any tilt.
- [ ] Invert flips the mouse turn direction.
- [ ] Imperial shows mph and ft everywhere the metric version shows km/h and m.
- [ ] Out-of-range or corrupt saved values fall back safely.

## Implementation notes

- Built in `core/pilot-settings.ts` (pure, clamped, tested), `core/format.ts` (units), `game/camera-rig.ts` (`setGogglesView`), `input/input.ts` (`setInvertTurn`) and the settings screen in `ui/menu.ts`.
- Verified in a browser: sliders and toggles save to `pw.pilot.v1` and survive a reload; with imperial units the speed gauge reads mph and the height and gate distance read feet.
- Not verified by a human: how the field of view and tilt feel in flight; invert direction.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Sanitize a settings object with out-of-range values | Clamped into range | Unit |
| 2 | Sanitize garbage | Defaults | Unit |
| 3 | `formatSpeed(28, 'imperial')` | `63 mph` | Unit |
| 4 | `formatHeightUnits(2.44, 'imperial')` | `8.0 ft` | Unit |
| 5 | Set invert, move the mouse right | Drone turns left | Manual |
| 6 | Set tilt to 0 and 50 | Camera pitch visibly changes; horizon still level | Manual |

## Out of scope

Chase camera field of view, vertical mouse axis, key remapping (Controls panel), per-drone camera tilt (Phase 3 hangar).

## Changelog

- 2026-11-01: Created.

- 2026-11-14: Added the Wind setting (on or off) for Free flight and Training on maps with wind (Glacier Pass). Races, time trials and challenges always have wind.
