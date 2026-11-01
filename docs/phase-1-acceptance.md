# Phase 1 Acceptance Status

Last updated: 2026-11-01

An honest record of what has been checked and how, so nothing is ticked that has not been verified. "Unit" means an automated test. "Browser" means checked in a headless browser with a software renderer (screenshots and scripted flights). "Player" means the product owner flew it on the live site and reported back. "Open" means not verified yet.

## Per feature

| Feature | Verified | Open |
|---|---|---|
| Project setup and deploy | CI builds PRs and deploys `main` to Cloudflare (every milestone merged and deployed green); no `^` or `~` versions; dependency log complete | Clean-clone check on another machine |
| World and environment | `heightAt` deterministic (unit); terrain below ceiling (unit); look checked (browser, player); draw calls 68 to 81 (browser, software renderer); quality presets switch and save (browser) | **60 fps on a real GPU** (the scene draws about 1.3 M triangles); Low preset visibly removing grass and shadows |
| Track and gates | Length 1.0 to 1.2 km, closed loop, above ground (unit); gate crossing rules (unit); legs and banner visible (browser); gate 0 starts the lap in a browser flight | A human flying all 12 gates in order |
| Drone model | Renders, props spin, shared geometry (browser, player) | Ghost looking translucent and shadowless on screen |
| Flight model | All acceptance criteria (unit); feels good (player) | Top-speed feel with the full world (player: "not sure, can't judge speed" before the world existed) |
| Controls and key bindings | Rebinding, reserved keys, corrupt data, persistence (unit); mouse turn and rebinding panel (player, browser) | Alt+Tab key release, focused-button Space handling in real browsers |
| Cameras and FPV effects | Goggles and chase views, fisheye, vignette, static logic (unit and browser); C toggle (player) | Static strength far from the pits on a real display |
| Height indicator | Gauge colours, ground line and ring (browser) | None known |
| HUD and OSD | OSD, gauges, gate marker, minimap, race panel, countdown, flight menu (browser) | Layout below 1100 px wide (the OSD overlaps the race panel under about 1000 px) |
| Collisions and crash | Ground, water, bump vs crash, gate frame, factory, trees (foliage included), roofs (unit, browser, player) | Container-gap flying and tree crashes beyond what the player tried |
| Time trial and ghost | Countdown with locked input, full lap, best lap saved (4 KB) and restored after reload, splits, empty-battery end, restart (unit and browser) | **A human flying real laps; the ghost replaying in sync on screen** |
| Free flight | Pad swap, empty battery, respawn rules (unit); mode tag and swap progress (browser) | None known |
| Main menu and settings | Menu, settings, Free flight, P, Time trial, Exit, saved quality and drain (browser) | Frame-rate readout on a real GPU |
| Motor sound | Tone mapping from throttle and speed (unit) | **How it sounds. Nobody has listened yet.** |
| Battery system | Drain, sag, low power, empty, voltage curve (unit) | **Tuning: a synthetic 26 s lap used about 11% of the pack, so a real 45 s lap would use roughly 20%, about five laps per battery against the 3 to 4 target.** Needs a real lap to confirm. |

## Known deviations from the docs

- Bloom is off by default (the doc says on for Medium and High): it white-washed the view toward the sun.
- Drag constants changed so top speed meets the acceptance criterion (see flight-model).
- A speed gauge was added next to the height and battery gauges.
- The world boundary is a hard wall with a faint grid, not a "signal lost" respawn.
- `game/game.ts` is 408 lines (target 300, split at 400); the dev-only test hooks already live in `debug-api.ts`.
- The "Best lap" tag above the ghost is built (`ui/ghost-tag.ts`).

## What the player should check next

1. Frame rate on Medium. If it is under 60, say what hardware and I will cut grass or tree counts first.
2. Press M and listen: motor pitch should rise with climbing, wind with speed.
3. Fly real laps in time trial: does the ghost show and match your best lap? Does the battery last about 3 to 4 laps?
4. Any layout problem on a smaller window.
