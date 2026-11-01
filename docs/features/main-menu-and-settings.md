# Feature: Main Menu and Settings

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M7)
Last updated: 2026-11-01

## Summary

The first screen players see: the game title over live broadcast-style footage of AI drones racing the track, with buttons to start flying, change controls and adjust graphics quality.

## Player experience

A loading screen ("Building the valley…") fades into the menu. Behind the title "PROPWASH", three AI drones race the track while the camera cuts between TV-style shots. Buttons on the left: Free flight, Time trial (with your best lap shown), Controls, Settings.

## Behavior and rules

- **Buttons:**

| Button | Subtitle | Action |
|---|---|---|
| Free flight | "Explore the valley at your own pace" | Starts free-flight |
| Time trial | "Best lap 0:45.27" or "Set your first lap time" | Starts time-trial |
| Controls | "Change keys and mouse speed" | Opens the Controls panel |
| Settings | "Graphics quality" | Opens Settings |

- **Background:** three AI drones (cyan, magenta, lime) follow the track with the `Track.poseAt` banking, slowing for tight curves (max lateral acceleration 18 m/s²), each with a slightly different speed and lateral offset. Camera: broadcast shots (see cameras-and-fpv-effects).
- **Settings panel:**
  - Graphics quality: Low / Medium / High, with a one-line description each.

| Preset | Pixel ratio | Shadows | Grass | Bloom |
|---|---|---|---|---|
| Low | 0.75 | Off | Off | Off |
| Medium (default) | min(device, 1) | 1024 px map | On | On |
| High | min(device, 1.75) | 2048 px map | On | On |

  - Live frame-rate readout ("Running at about 58 frames per second on this device").
  - Saved in `localStorage` key `pw.quality.v1`.
  - **Battery drain in free flight:** On (default) / Off (see battery-system). Saved in `pw.freeBattery.v1`.
- **Pause / exit:** in flight, P or "Exit to menu" returns here; pointer lock is released.
- Keyboard: buttons are focusable and work with Enter/Space.

## UI

- Title: "PROPWASH" in the display font, orange "PROP".
- Left column of large uppercase buttons with subtitles; primary button highlighted with the gate-orange accent.
- Modals (Settings, Controls) share one modal style.

## Technical design

- `src/ui/menu.ts`: builds the menu and settings DOM; exposes callbacks `onStart(mode)`, `onOpenControls()`, `onQualityChange(preset)`.
- `src/drone/track-racer.ts`: AI drone that follows the track (shared later for ghost-style replays and AI opponents).
- `src/core/renderer.ts`: `applyQuality(preset)` from `config.ts` → `QUALITY`.
- `src/game/game.ts`: switches between `menu`, `free` and `trial` and starts/stops each mode cleanly (disposes nothing shared; resets mode state).

## Edge cases

- Storage blocked: default quality each load.
- Very slow device: frame-rate readout helps the player choose Low.
- Returning to the menu mid-lap: the lap is discarded; best lap unaffected.

## Acceptance criteria

- [ ] Loading screen fades into the menu once the world is built.
- [ ] AI drones race in the background with camera cuts.
- [ ] Every button works; Time trial shows the saved best lap.
- [ ] Quality presets apply immediately and persist.
- [ ] P returns to the menu from flight and releases the mouse.

## Implementation notes (M7)

- `ui/menu.ts` (DOM only, calls back into the game), `game/menu-director.ts` (3 AI racers on `drone/track-racer.ts`, TV-style shots from `game/broadcast-shots.ts`, hard cut every 7 s), `CameraRig` has a `broadcast` mode that remembers the pilot's camera.
- The game has two phases, `menu` and `playing`. **P** or the flight menu's "Exit to menu" returns to the menu and releases the mouse.
- Quality presets live in `config.ts` → `QUALITY` and are saved in `pw.quality.v1`. **Bloom is off in all presets** (see cameras doc): measured, it white-washes the view toward the sun and costs GPU time. The table above is therefore pixel ratio, shadows and grass only. Low also drops shadows entirely.
- The settings panel also has the free-flight battery drain toggle (`pw.freeBattery.v1`).
- Racers start halfway between gates so the menu camera never sits inside a gate frame.
- Verified in a browser: menu loads over the flyby; Free flight, P, Time trial and Exit all switch phases correctly; quality and drain choices are saved. Not verified on a real GPU: the frame rate readout showed about 36 fps in the software renderer.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Load the page | Loading screen, then menu with racing drones | Manual |
| 2 | Settings → Low, reload | Low still selected; no grass or shadows | Manual |
| 3 | Set a best lap, return to menu | Time trial subtitle shows it | Manual |
| 4 | Tab through the menu with the keyboard | Focus visible; Enter activates | Manual |
| 5 | In flight press P | Back at menu, mouse released | Manual |

## Out of scope

Hangar, lobby, results screen, pilot profile and friends list (Phases 3–5).

## Changelog

- 2026-11-01: Created.
