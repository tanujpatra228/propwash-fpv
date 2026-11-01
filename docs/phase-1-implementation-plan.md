# Phase 1 Implementation Plan

Last updated: 2026-11-01
Source: `plan.md` §6 (tasks 1.2 to 1.16), `engineering-standards.md`, and the 15 Phase 1 feature docs in `features/`.

Goal: a playable, deployed game with good-feeling flight, free flight and time trial, battery, ghost, HUD, menu and sound, on the Cloudflare free plan.

---

## 1. Strategy

1. **Vertical slice first.** The biggest risk is flight feel on keyboard and mouse. Get a drone flying over simple terrain in milestone 2, before building the full world. Tune early.
2. **Deploy on day one.** Ship an empty page to Cloudflare in milestone 1 so the pipeline problems (secrets, token scopes) surface now, not at the end.
3. **Pure logic first, with unit tests.** Flight model, battery, lap tracker, ghost codec, key bindings, collider queries and gate crossing are DOM-free and tested with Vitest before any visuals depend on them.
4. **Follow the layer order.** `config → core → physics / world / input → drone → ui → game → main`. Build bottom-up so nothing ever imports against the arrow.
5. **Feature doc status and `CLAUDE.md` table are updated in the same commit as the code** (Planned → In progress → Done).
6. **Battery is not last.** Task 1.16 sits at the end of the plan table, but `FlightModel.step` takes `DroneStats` and `powerFactor` and returns `effort`. `DroneStats` and `Battery` are built together with the flight model (M2).

## 2. Milestones at a glance

| M | Name | Plan tasks | Playable result | Deployed |
|---|---|---|---|---|
| M1 | Foundation | 1.2, 1.14 | Empty page builds and deploys | Yes |
| M2 | Fly a box | 1.5, 1.6, 1.9 (chase), 1.16 (pure) | Drone flies over rough terrain, remappable keys, chase cam | Yes |
| M3 | World | 1.3 | Full valley matches the preview | Yes |
| M4 | Track and collisions | 1.4, 1.7, 1.8 | 12 gates, crashes, respawn at last gate | Yes |
| M5 | Cameras and HUD | 1.9, 1.10 | Goggles view with FPV effects, OSD, gauges, minimap | Yes |
| M6 | Modes | 1.11, 1.16 (modes), free flight | Free flight and time trial with ghost and battery rules | Yes |
| M7 | Menu, sound, polish | 1.12, 1.13, 1.15 | Full game loop from menu, motor sound, perf pass | Yes |
| M8 | Release gate | all | Acceptance run, docs reconciled, Phase 1 closed | Yes |

Each milestone ends with: `pnpm typecheck` and `pnpm build` green, the milestone's feature test cases run, review checklist (standards §14) ticked, merge to `main`, deploy confirmed.

---

## 3. Milestone detail

### M1 Foundation (feature: project-setup-and-deploy)

Build:
- `package.json` (pnpm `packageManager` pin, `onlyBuiltDependencies: esbuild, workerd`), `.npmrc` (`save-exact`, `engine-strict`), `tsconfig.json` (strict), `vite.config.ts` (Three.js chunk split), `wrangler.jsonc` (assets only, SPA fallback), `.gitignore` (include `.dev.vars`), `index.html`, `src/main.ts`, `src/style.css` with `:root` tokens (`--gate`, `--ok`, `--warn`, `--bad`, `--osd`).
- `.github/workflows/deploy.yml`: push to `main` deploys, PRs build only, manual dispatch.
- `docs/dependencies.md`: first entry for every package and every GitHub Action.
- Add Vitest now (dev dependency, logged) so every later pure module ships with tests. Add `pnpm test` script. Update `project-setup-and-deploy.md` script table.
- `src/config.ts` skeleton and `src/core/{math,storage,dom,format}.ts` with tests (`clamp`, `damp`, `smoothstep`, `createRng`, `hash2`, `valueNoise`, `fbm`, `loadJson/saveJson`, `mustGet`, `el`, the format functions).

Packages (exact versions chosen at install time, verified against the registry, not guessed): `three`, `@types/three`, `typescript`, `vite`, `wrangler`, `vitest`. Pin pnpm and Node 22 in CI.

Exit: all five project-setup test cases pass, workers.dev URL serves the page.

**Needs from you:** add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to GitHub Actions secrets. I cannot do this. Without it M1 cannot close.

### M2 Fly a box (flight-model, controls-and-key-bindings, drone-model, battery-system pure part)

Build, in order:
1. `drone/drone-stats.ts` (`DroneStats`, `STOCK_STATS`), `config.ts` → `FLIGHT`, `BATTERY`.
2. `drone/flight-model.ts` with tests (see below). Returns `effort`.
3. `drone/battery.ts` with tests. Cell curve and current formula live only here.
4. `input/key-bindings.ts` (`ACTIONS`, `rebind`, `actionForCode`, `keyLabel`, load/save) with tests, then `input/input.ts` (keyboard, pointer lock, drag fallback, blur release).
5. `world/terrain.ts` minimal: `heightAt`, `groundY`, plain shaded mesh. Real colors come in M3.
6. `drone/drone-model.ts` (shared geometries, `spinProps`, ghost variant flag).
7. `core/renderer.ts` basic (`WebGLRenderer`, ACES tone mapping, resize), `game/camera-rig.ts` chase mode, `game/game.ts` loop with fixed clamp of `dt`.
8. `ui/controls-panel.ts` (built from `ACTIONS`).

Unit tests that gate the milestone:
- Flight: 60 frames at 1/30 s with `up=1` gives 9 to 11 m; 150 idle frames then drift under 0.5 m; 90 frames `forward=1` gives 15 to 19.5 m/s; `dt = 0` stays finite; opposite keys cancel.
- Battery: `step(0, 60)` about 0.13 Ah; `step(1, 60)` about 0.83 Ah; 10% charge gives `powerFactor` 0.8; 0% gives `isEmpty` and 0.
- Bindings: key moves between actions and reports the source; reserved keys rejected; corrupt storage falls back to defaults.

Exit: you can fly with keyboard and mouse, rebind keys, and the numbers feel right. **This is the first playtest. Tune `FLIGHT` before building more on top.**

### M3 World (world-and-environment)

Build, in order: `world/textures.ts` (procedural canvases), full `world/terrain.ts` (zones, colors, lake, factory flattening, `buildWater`), `world/sky.ts` (Sky, IBL, sun, fog, shadow follow, `setShadowExtent`), `world/scenery.ts` (pit area, factory, instanced pines, broadleaf, rocks, wind grass, clouds), quality presets in `config.ts` → `QUALITY`, `WORLD.version`.

Notes:
- Scenery registers collision shapes as it builds. Define the `ColliderWorld.addBox/addCylinder` signatures first (M4 step 1) and have `scenery.ts` call them, so visuals and colliders cannot drift. Practical order: write `physics/colliders.ts` and its tests at the start of M3.
- Tree and rock placement uses `createRng(seed)` only. Exclusion zones (track 12 m, lake, factory, pits) need the track centre line, so M3 and M4 overlap here: `world/track.ts` (spline and samples only) is written at the end of M3 so trees can avoid it.
- Frame budget check as each feature lands: `renderer.info.render.calls` under 150 on Medium.

Exit: world matches the preview artifact (see open question 2), `heightAt` determinism test passes, Low preset removes grass and shadows.

### M4 Track and collisions (track-and-gates, collisions-and-crash)

Build:
1. `world/track.ts` complete: 11 control points, closed centripetal Catmull-Rom, 4,000 samples, `sampleAt/tangentAt/curvatureAt/poseAt`, clearance smoothing. Test: length 1.0 to 1.2 km, closed, never under 1.8 m clearance.
2. `world/gates.ts`: meshes, legs to ground, start banner, frame bars registered as colliders, `checkGateCrossing` with the four crossing unit tests.
3. `game/lap-tracker.ts` (pure) with tests: in-order lap, skipped gate, splits.
4. `physics/resolve.ts`: ground, water, obstacle rules, crash reasons, sub-stepping below 30 fps. Tests for `query` inside and outside a box, cylinder grid.
5. Game layer: crash state (1.6 s), respawn at last gate facing the next, **R** reset.

Exit: all collision test cases manual-pass, no gate intersects terrain, legs touch the ground.

### M5 Cameras and HUD (cameras-and-fpv-effects, height-indicator, hud-and-osd)

Build:
1. Renderer post chain: `RenderPass → UnrealBloomPass → OutputPass → FPV ShaderPass`, `setLens`, goggles camera, **C** toggle, hide own drone in goggles.
2. `HudState` type and `ui/hud.ts` composer. Elements, one file each: `osd`, `height-gauge`, `battery-gauge`, `race-panel`, `gate-marker`, `minimap`, `flight-menu`, `help-bar`, `banner`. Shared formatting in `core/format.ts`.
3. `ui/ground-marker.ts` (chase only). Thresholds from `HUD.height`, shared by gauge and marker.
4. Static logic (distance from pits, factory, crash) computed in `game/`, passed into the shader.

Rules: text updates every 3rd frame, no allocations per frame, minimap track drawn once offscreen.

Exit: height gauge in both cameras with correct colors, static behaves per table, **G** toggles it.

### M6 Modes (free-flight, time-trial-and-ghost, battery-system game rules)

Build:
1. `drone/ghost.ts` (pure): `GhostRecorder`, `GhostTrack`, `encodeGhost/decodeGhost` (20 Hz, 1 cm and 0.01 rad quantization, delta ints). Tests: round trip within tolerance, 45 s lap under 20 KB.
2. `game/modes/free-flight.ts`: pad spawn, gate tracking without timing, bounds and "Signal lost", pad battery swap (height under 0.15 m, within 1.4 m, under 0.5 m/s, hold 2 s), drain Off setting.
3. `game/modes/time-trial.ts`: 3 s countdown with input lock, flying start timer, splits against best, ghost record and playback, storage key `pw.trial.valley-sprint.w<version>.v1`, battery-empty ends the run with summary.
4. Respawn logic shared by both modes in one place (standards §4: no mode-specific copies).
5. Empty-battery rules: motors cut, run ends on ground contact or after 3 s.

Exit: best lap and ghost survive reload, corrupt storage is ignored, 3 to 4 laps per battery at racing pace (tune `BATTERY` constants here, formula stays).

### M7 Menu, sound, polish (main-menu-and-settings, motor-sound)

Build: `drone/track-racer.ts` (AI on `Track.poseAt`), broadcast camera shots (7 s hard cuts), `ui/menu.ts` (4 buttons, settings panel with quality, FPS readout, battery drain toggle), `applyQuality`, `game.ts` state machine (`menu | free | trial`), pause with **P**, pointer-lock release, `core/audio.ts` `MotorSound` (default off, first **M** press creates audio, fade on motors cut, wind noise).

Exit: every menu path works, no sound in menus, no errors with Web Audio blocked.

### M8 Release gate (plan task 1.15 and closure)

- Run every test case in every Phase 1 feature doc, tick acceptance boxes, set statuses to Done.
- Performance run: 60 fps on Medium at 1080p, under 150 draw calls, initial load under 3 MB. Fix or log misses.
- Reconcile docs with what was built (changelog lines), update `plan.md` Phase 1 status, bump nothing in `WORLD.version` after this point without a note.
- Confirm no `^` or `~` in `package.json`, `dependencies.md` complete.

---

## 4. Dependency graph (build order)

```
M1: config, core/{math,storage,dom,format}, tooling, CI
 └─ M2: drone-stats → flight-model, battery ; key-bindings → input ; terrain(min) ; drone-model ; renderer(min) ; camera-rig(chase) ; game loop
     └─ M3: colliders(API), textures, terrain(full), sky, scenery, track(spline)
         └─ M4: track(full), gates, lap-tracker, resolve, crash/respawn
             └─ M5: renderer post chain, goggles camera, hud/*
                 └─ M6: ghost, free-flight, time-trial
                     └─ M7: track-racer, menu, audio, quality
                         └─ M8: acceptance
```

## 5. Branch and commit workflow (decided)

- **One branch for the whole phase:** `feat/phase-1`, branched from `main`.
- **Many small commits.** Every commit message starts with its milestone: `M1: chore: add Vitest`, `M3: feat: add instanced pines`. A milestone can have as many commits as it needs.
- Each feature doc is updated in the same commit series as its code.
- **Periodic merges:** `feat/phase-1` is merged into `main` through a pull request at the end of each milestone (or when the owner asks) so progress shows on the live URL. Use a merge commit, not a squash, so the branch history stays shared and later merges stay clean. After each merge confirm the Actions run is green and the site updated.
- **The phase branch is never deleted until Phase 1 is complete.** Keep working on it after each merge. Delete it (locally and on GitHub) only after the final M8 merge.
- Work outside a phase (a bug found on live `main`, a doc-only change) gets its own `fix/<name>` or `docs/<name>` branch with the same merge and delete steps.
- Pushes go to `feat/phase-1` at the end of each milestone (and more often when useful), so work is never only in the container.

## 6. Risks and how this plan handles them

| Risk | Handling |
|---|---|
| Flight feels wrong | Playtest at end of M2, before the world exists. All numbers in `config.ts`. |
| Deploy pipeline breaks late | Deployed in M1. |
| Colliders drift from visuals | Scenery and gates register colliders at build time (M3, M4). |
| Draw calls or fps over budget | Check `renderer.info` at the end of M3, M5 and M8, not only at the end. |
| World change invalidates ghosts | `WORLD.version` in the storage key; freeze noise and seeds after M3. |
| Battery tuning (3 to 4 laps) needs real laps | Tune in M6 once a full lap is flyable; keep the formula fixed. |
| File size creep (target 300 lines) | `scenery.ts` and `hud.ts` are the likely offenders; split per element up front (trees, grass, factory, pits as separate files). |

## 7. Doc issues to fix along the way

- `plan.md` §3.6 says hover is about 8 A and the battery lasts 2.5 to 3 minutes at racing pace, while `battery-system.md` also quotes "3 to 4 laps". With a 45 s lap that is 2.25 to 3 minutes: consistent, but only if lap time is near 45 s. Verify in M6; adjust whichever number is wrong.
- ~~Flight bounds vs mountain ring~~ Resolved in M5: a hard ±900 m box with a 300 m ceiling and a faint grid wall; the mountain ring inside it is flyable.
- `main-menu-and-settings.md` lists the quality presets but `config.ts` `QUALITY` is not defined anywhere else; define it once in M3.
- `project-setup-and-deploy.md` does not mention Vitest. Add it in M1.

## 8. Decisions and open items

Resolved:
1. Cloudflare secrets are in GitHub Actions secrets. M1 verifies them with the first deploy.
2. Preview artifact is the look reference. Its source is a single HTML file (about 1,900 lines) using Three.js 0.160.0 with procedural terrain (`baseH`, `heightAt`), a Catmull-Rom track, procedural canvas textures, Sky plus PMREM lighting, and the FPV post pass. M3, M4 and M5 port its constants and algorithms into the module layout above rather than copying the file. The preview uses `Math.random()` for textures and placement, so the port must replace that with the seeded generator.
3. Branch strategy: one `feat/phase-1` branch with milestone-prefixed commits, see §5.

Open:
- Three.js version: the preview runs 0.160.0. M1 picks the exact pin (the latest stable at install time is fine unless addons used by the preview moved; check `Sky`, `OutputPass`, `UnrealBloomPass` imports).
