# Feature: HUD and OSD

Status: Planned
Phase: 1
Branch: `feat/hud`
Last updated: 2026-11-01

## Summary

Everything drawn over the 3D view during flight: the FPV on-screen display (OSD) in goggles view, the race panel, gate counter and next-gate marker, minimap, in-flight menu buttons, help bar, countdown and banners. The height gauge has its own doc (height-indicator).

## Player experience

In goggles view, white monospace text in the corners like real FPV goggles: battery voltage, battery used, link quality, flight timer, flight mode, throttle and speed, with a crosshair and a horizon line in the middle. Around the edges, game info: lap times, the gate you need next, a diamond marker pointing at it, and a round minimap.

## Behavior and rules

### OSD (goggles view only)

| Corner | Items |
|---|---|
| Top left | Battery voltage with sag (e.g. `16.4V`, yellow below 20% charge), battery used (`312mAh`), blinking `LOW BATTERY` below 20% |
| Top right | `● REC` (red), link quality `LQ 97–99`, flight timer `mm:ss` |
| Bottom left | Flight mode `ANGLE`, throttle `THR 42%` |
| Bottom right | Speed `84 km/h` |
| Centre | Crosshair; horizon line that tilts with roll and moves with pitch (accounting for camera uptilt) |

- Voltage, mAh and the low-battery warning come from the battery model (see battery-system). The HUD only displays them.
- Flight timer counts only while flying (not during countdown).
- Font: `--osd` (Share Tech Mono), white with a black outline for readability on any background.

### Game HUD (both cameras)

| Element | Where | Shows |
|---|---|---|
| Race panel | Top left | Time trial only: lap number, current lap time, last lap, best lap, split vs best at the last gate (green faster, red slower) |
| Mode tag | Top left | Free flight only: "Free flight" and a short hint |
| Gate counter | Top centre | `GATE n / 12` (time trial) |
| Next-gate marker | On screen at the next gate; clamped to the screen edge when off screen or behind | Diamond and distance in metres |
| Minimap | Bottom right, round | Track line, lake, factory, start gate, drone arrow (heading), ghost dot |
| Height gauge | Bottom left | See height-indicator |
| Battery gauge | Bottom left, next to the height gauge | Charge %, bar, time left; pad-swap progress ring. See battery-system |
| Flight menu | Top right | Camera, Analog static, Motor sound, Reset to last gate, Change controls, Exit to menu; each shows its current key |
| Help bar | Bottom centre | Current keys for up/down, forward/back, slide, turn; mouse-lock hint |
| Countdown | Centre | 3, 2, 1, GO |
| Banners | Centre | "Crashed" with reason; "New best lap" with time; "Low battery", "Battery empty" (with run summary), "Fresh battery" |
| Ghost tag | Above the ghost | "Best lap" |

- Text updates are throttled (every 3rd frame); the gate marker updates every frame.
- Layout adapts below 1100 px and 760 px wide (less important panels hide).

## Technical design

- `src/ui/hud.ts`: `Hud` class composes the pieces; `update(state: HudState, dt)`. Reads a plain `HudState` object built by the game each frame; never reads game internals.
- `src/ui/osd.ts`, `src/ui/race-panel.ts`, `src/ui/gate-marker.ts`, `src/ui/minimap.ts`, `src/ui/flight-menu.ts`, `src/ui/help-bar.ts`, `src/ui/banner.ts`: one element each.
- `src/core/format.ts`: `formatLapTime`, `formatSplit`, `formatSpeedKmh`, `formatTimer`, shared by every panel.
- Styles in `src/style.css`, all colors via `:root` tokens.
- Minimap draws the static track once to an offscreen canvas and only redraws dots per frame.

## Edge cases

- Next gate behind the camera: marker flips and clamps to the screen edge.
- Very narrow window: OSD corners and flight menu hide; race panel and height gauge stay.
- Key rebinding: help bar and button key hints update immediately.

## Acceptance criteria

- [ ] OSD shows in goggles view only, with all listed items updating live.
- [ ] Race panel shows correct lap and split times in time trial.
- [ ] Next-gate marker always points to the correct next gate, on or off screen.
- [ ] Minimap arrow matches the drone's position and heading.
- [ ] No layout overlap at 1280×720 and 1920×1080.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `formatLapTime(65.4321)` | `1:05.43` | Unit |
| 2 | `formatSplit(-0.42)` / `formatSplit(1.2)` | `-0.42` / `+1.20` | Unit |
| 3 | Goggles view, climb and fly | THR, speed, mAh and voltage change | Manual |
| 4 | Turn so the next gate is behind | Marker sits on the screen edge in the right direction | Manual |
| 5 | Resize to 1280×720 and 1920×1080 | No overlapping panels | Manual |

## Out of scope

Race positions vs other pilots, chat, name tags for friends (Phase 5).

## Changelog

- 2026-11-01: Created.
