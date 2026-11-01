# Feature: Cameras and FPV Effects

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M5)
Last updated: 2026-11-01

## Summary

Two flight cameras: the **goggles** view (what an FPV pilot sees through the drone's camera, with lens effects) and the **chase** view (third person, easier for beginners). Plus the cinematic menu camera.

## Player experience

- **Goggles:** wide view from the drone's nose camera, tilted up, slight fisheye, dark corners, light sensor grain, and analog static when the signal is weak or after a crash.
- **Chase:** the camera follows behind and slightly above the drone, smoothly.
- Press **C** to switch at any time.
- **Menu:** TV-style broadcast shots of AI drones racing, cutting between chase, side-tracking and trackside shots every 7 s.

## Behavior and rules

Values in `config.ts` → `CAMERA`.

| Camera | Setting | Value |
|---|---|---|
| Goggles | Position | 0.035 m up, 0.07 m forward of the drone centre |
| Goggles | Uptilt | 25° (setting range 0–50° in Phase 2) |
| Goggles | Vertical FOV | 86° |
| Goggles | Near plane | 0.03 m |
| Chase | Offset | 3.6 m behind (horizontal heading), 1.15 m up, looks 2 m ahead |
| Chase | Smoothing | 8 /s, kept ≥ 0.5 m above ground |
| Chase | Vertical FOV | 70° |
| Menu | Shots | Chase (7 m behind), side track (13 m out), fixed trackside (120 m ahead), 7 s each, hard cuts |

**FPV lens pass** (post-processing, goggles only):

| Effect | Value |
|---|---|
| Barrel distortion | strength 0.22, rescaled so screen edges stay filled |
| Chromatic aberration | 0.0022 |
| Vignette | strong (0.85) in goggles, light (0.35) elsewhere |
| Sensor grain | 0.05 with analog on, 0.012 off |
| Analog static | 0 normally; rises with distance from the pits (260–420 m → up to 0.5); 0.12 inside the factory; 0.4–1.0 during a crash. Toggle with **G** |

- Own drone model hidden in goggles view, shown in chase view.
- OSD (see hud-and-osd) shows only in goggles view. The height gauge shows in both.

## Technical design

- `src/game/camera-rig.ts`: `CameraRig` with modes `goggles | chase | broadcast`; `update(dt, target)`; owns FOV/near changes (calls `updateProjectionMatrix` only on change).
- `src/core/renderer.ts`: builds `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass` → FPV `ShaderPass`; exposes `setLens({ fisheye, vignette, grain, static })`.
- Static amount is computed by game logic and passed in; the shader knows nothing about the game.

## Edge cases

- Chase camera inside terrain or factory walls: clamped above ground; walls may clip in Phase 1 (camera collision in Phase 2).
- Aspect ratio change: distortion uses the live aspect ratio.
- Low quality: bloom off; lens pass stays (cheap).

## Acceptance criteria

- [ ] C switches cameras instantly in flight.
- [ ] Goggles view shows uptilt, fisheye, vignette and grain; static appears far from the pits, in the factory, and on crash.
- [ ] G turns analog static and grain off and on.
- [ ] Chase camera never goes below ground.
- [ ] Menu camera cuts between three shot types.

## Implementation notes (M5)

- `core/renderer.ts` runs the chain render, bloom, tone-map, FPV lens. The lens shader (`core/fpv-shader.ts`) takes plain numbers (fisheye, vignette, grain, static); the game computes them (`game/fpv-static.ts`, pure and tested).
- Bloom is off by default (`LENS.bloom.isEnabled`). The first look had bloom on and everything glowed, and facing the sun gave a white-out (average brightness 180 with bloom vs 93 without). Look values are in `RENDER` and `LENS` in `config.ts`.
- Goggles camera is rigidly attached to the drone (no smoothing), tilted up 25 degrees; the drone model is hidden in this view.
- Verified in a headless browser: fisheye, vignette, chromatic fringing and grain show in goggles; chase view shows a light vignette only.
- The broadcast camera for the menu is built with the menu in M7.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Press C in flight several times | Toggles each press; own drone visible only in chase | Manual |
| 2 | Fly 400 m from the pits in goggles | Static gradually increases | Manual |
| 3 | Press G | Static and grain disappear; press again, they return | Manual |
| 4 | Fly low over a hill in chase view | Camera stays above the ground | Manual |
| 5 | Watch the menu for 25 s | At least three different shots | Manual |

## Out of scope

Uptilt and FOV settings, camera collision with walls, replay camera (Phase 2+).

## Changelog

- 2026-11-01: Created.
