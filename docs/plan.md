# Propwash FPV — Project Plan

Last updated: 2026-11-01
Status: Phase 1 in progress

Propwash is a browser-based FPV (first-person view) drone racing game. Players fly a small racing drone through a hand-built valley, race through gates, chase their own best-lap ghost, and later race friends live over the internet. It runs in any modern desktop browser with keyboard and mouse and is hosted on the Cloudflare Workers free tier.

The approved look and feel is the interactive preview: <https://claude.ai/artifact/2snCvRHbQfnDMGPayTNREJ>

---

## 1. Goals

1. **Fun first.** Flying must feel good within the first minute, even for someone who has never flown a drone or played a simulator.
2. **Realistic enough.** Semi-realistic graphics: real lighting, shadows, materials and atmosphere, but not photoreal. Runs at 60 fps on a mid-range laptop.
3. **Simple controls.** Keyboard and mouse only. Every key can be remapped.
4. **Play with friends.** Async (ghost races, leaderboards) first, then live race rooms with friends.
5. **Zero hosting cost.** Cloudflare **free plan only**: no paid plan, no paid add-ons, nothing that needs a payment method. Every server feature must fit the free limits (see `engineering-standards.md` §2).

### Non-goals (for now)

- Gamepad, RC transmitter or mobile/touch support.
- Photoreal graphics, huge open world, or full aerodynamic simulation.
- Accounts and passwords. Players join with a name and a link.
- Anti-cheat. The game is for friends.

---

## 2. Key decisions

| Topic | Decision | Why |
|---|---|---|
| 3D engine | Three.js | Lightweight, biggest community, enough visual quality |
| Language | TypeScript (strict) | Catches mistakes early, self-documenting |
| Build tool | Vite | Fast dev server with live reload, small static output |
| Package manager | pnpm only (never npm) | Fast, strict, disk-efficient |
| Dependency versions | Exact pins, no `^` or `~`; every package logged in `docs/dependencies.md` | Reproducible builds and a clear audit trail |
| Physics | Custom flight model + simple collision shapes | Drone flight is simple; a full physics engine is not needed in Phase 1 |
| Hosting | Cloudflare Workers static assets (free) | Static asset requests are free and unlimited |
| Live multiplayer | One Cloudflare Durable Object per race room, WebSockets | Free tier includes Durable Objects; one room = one object |
| Leaderboards / ghosts | Cloudflare D1 (SQLite) | Generous free tier |
| Assets | CC0 only (Poly Haven, ambientCG, Quaternius, Kenney) + Blender | Free and legally safe |

---

## 3. Game design summary

### 3.1 The world

One hand-built valley of about 2.6 km × 2.6 km, with these zones:

- **Pit area:** landing pad, tent, containers. Free flight starts here.
- **Start/finish straight:** checkered start gate.
- **Old factory ("bando"):** open concrete structure the track flies through.
- **Lake:** low pass over the water (touching the water is a crash).
- **Forest hills:** weaving between pines and broadleaf trees.
- **Mountain ring:** snowy peaks around the valley edge (scenery, not flyable in Phase 1).

Golden-hour lighting, haze, clouds and grass that moves in the wind.

### 3.2 The track

- "Valley Sprint", about 1.1 km, 12 gates, one closed loop.
- Gates are 4.2 m × 3.0 m padded frames with glowing LED strips.
- Gates must be passed in order. The next gate is always marked on screen.
- A lap ends when you pass the start gate again after all 12 gates.

### 3.3 Game modes

| Mode | Phase | Description |
|---|---|---|
| Free flight | 1 | Start on the pad, fly anywhere, no timer; land on the pad to swap the battery |
| Time trial | 1 | One battery per run: fly laps against the clock and your best-lap ghost (saved in the browser) |
| Training | 2 | Short lessons: take off, hover, land, fly through gates |
| Battery Challenge | 3 | Finish the laps before the battery dies; setup choice matters |
| Online ghosts + leaderboard | 4 | Race friends' best laps, shared leaderboard (Spec and Open classes) |
| Live race rooms | 5 | Create a room, share a link, up to 8 friends race live |
| Track editor | 6 | Place gates, share tracks by code |

### 3.4 Controls (default, all remappable)

| Action | Key | Alternate |
|---|---|---|
| Go up | Space | — |
| Go down | Left Shift | — |
| Fly forward / back | W / S | ↑ / ↓ |
| Slide left / right | A / D | ← / → |
| Turn left / right | Mouse (pointer lock) | Q / E |
| Switch camera (goggles / chase) | C | — |
| Reset to last gate | R | — |
| Analog static on/off | G | — |
| Motor sound on/off | M | — |
| Pause / back to menu | P | — |

Flight model ("beginner angle mode"):

- Horizontal movement uses real tilt physics: the drone tilts, thrust pushes it, air drag limits top speed to about 100 km/h.
- Vertical movement uses altitude hold: Space climbs at 6 m/s, Shift descends at 5 m/s, and releasing both holds the current height.
- The drone leans into turns automatically and sideways drift is reduced so turns follow the nose.
- Mouse turning uses pointer lock (click the view; Esc releases). If pointer lock is refused, click-and-drag steering is the fallback.

Remapping: a Controls panel lists every action with a main and an alternate key. Click, press a new key, done. A key already in use moves to the new action and the player is told. Esc cancels, Backspace clears. Mouse turn speed slider. Reset to defaults. Saved in `localStorage`.

### 3.5 HUD

- **Goggles camera:** FPV-style on-screen display (battery voltage, mAh used, link quality, flight timer, flight mode, throttle, speed), crosshair and horizon line. Lens distortion, vignette and optional analog static.
- **Chase camera:** third-person view behind the drone.
- **Height above ground (both cameras):** gauge in the bottom-left with the value in metres (one decimal below 10 m). Green above 2 m, yellow 0.6–2 m, red below 0.6 m. Measured to the lake surface when over water.
- **Ground line (chase camera only):** dashed line from the drone to the ground with a ring at the landing point, using the same colors.
- **Race panel (time trial):** current lap time, last lap, best lap, lap count, gate counter "GATE n / 12", next-gate marker, minimap.
- **Battery gauge (both cameras):** charge %, bar and estimated time left; "LOW BATTERY" warning below 20%.

### 3.6 Battery and drone setups

- **Battery (Phase 1):** a real 4S 1,500 mAh battery model. Current draw rises with tilt, climbing and speed (hover ≈ 8 A, racing ≈ 35 A, about 3–4 laps per battery at racing pace). Below 20% the drone loses power; at 0% the motors cut and it falls. Time trial is one battery per run; free flight swaps the battery when you land on the pad. Details: `features/battery-system.md`.
- **Parts and upgrades (Phase 3):** a Hangar to choose propellers (2-blade Swift, 3-blade Allround, 4-blade Grip, 5-blade Hauler) and batteries (1100, 1500, 1800 mAh 4S, 1300 mAh 6S). More blades = more grip and lift but more battery drain; fewer blades = faster and more efficient but twitchy. Parts upgrade to level 3 with credits earned by flying. Details: `features/drone-parts-and-upgrades.md`.
- **Fair racing:** Spec class (stock parts) and Open class (any setup, shown next to the time) for best laps, leaderboards and live rooms.
- **Built in from day one:** the flight model and battery read a `DroneStats` object (stock values in Phase 1), so parts plug in later without rewriting flight code.

---

## 4. Architecture

### 4.1 Repository layout

```
propwash-fpv/
├─ .github/workflows/deploy.yml   CI: typecheck, build, deploy main to Cloudflare
├─ docs/                          Markdown-only project documents (this folder)
├─ public/                        Static files copied as-is (favicon)
├─ src/
│  ├─ main.ts                     Entry point: boots the game
│  ├─ style.css                   UI styles
│  ├─ config.ts                   All tunable constants and presets
│  ├─ core/                       Math, storage, DOM and format helpers, renderer and post-processing, audio
│  ├─ world/                      Terrain, water, sky, track, gates, scenery, textures
│  ├─ physics/                    Collision shapes, queries and response
│  ├─ drone/                      Drone 3D model, flight model, track-following AI, ghosts
│  ├─ input/                      Key bindings and keyboard/mouse input
│  ├─ ui/                         HUD, menus, controls panel
│  └─ game/                       Game state machine and loop, camera rig, lap tracker, modes
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ wrangler.jsonc                 Cloudflare Workers config (static assets)
└─ package.json / pnpm-lock.yaml
```

### 4.2 Runtime overview

- `Game` owns the scene, the current mode (`menu`, `free`, `trial`) and the main loop.
- Each frame: read input → step the flight model (or AI drones in the menu) → collisions → lap/gate logic → camera → HUD → render.
- The world is generated procedurally at startup from deterministic noise, so every player sees the same valley with no large downloads. Phase 2 swaps in real textures and models.
- Rendering: `WebGLRenderer` with ACES tone mapping and soft shadows. Post-processing chain: render → bloom → output → FPV lens pass (distortion, vignette, grain, static).
- Quality presets (Low / Medium / High) control pixel ratio, shadows, grass and bloom.

### 4.3 Backend (Phase 4+)

- **Worker** (same project) serves the static game and a small JSON API.
- **D1** stores pilots, best laps and ghost data (compressed path, a few KB each).
- **Durable Object `RaceRoom`**: one per live race. Players connect over WebSocket. Clients send position updates at 10–15 Hz. The room relays them, tracks gates and finish order, and uses WebSocket hibernation to save duration.

### 4.4 Free-plan budget (free plan only; verify current limits before Phase 4/5)

- Static asset requests: free and unlimited. Max 25 MiB per file, so compress textures and models.
- Worker requests: about 100k/day.
- Durable Objects: incoming WebSocket messages are billed at about 1/20 of a request. 8 players at 15 Hz is about 6 billed requests/second, so a few hours of full races per day. Fallback if needed: lower tick rate or peer-to-peer.
- D1: about 5M rows read/day and 100k rows written/day.

---

## 5. Engineering workflow

### 5.1 Git and deployment

1. One branch per feature, named `feat/<name>`, `fix/<name>` or `docs/<name>`.
2. Commit on the branch, push it to GitHub.
3. Merge into `main`. Every push to `main` runs `.github/workflows/deploy.yml`: install → typecheck → build → `wrangler deploy` to Cloudflare.
4. When the merge is deployed successfully, delete the branch locally and on GitHub.
5. Secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are stored in GitHub Actions secrets. They are never committed.

### 5.2 Dependencies

- Install with `pnpm add -E <pkg>@<version>` (exact). `.npmrc` enforces `save-exact=true`.
- Every added, removed or upgraded package (including GitHub Actions versions) gets an entry in `docs/dependencies.md` with version, purpose and date.
- Commit `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.

### 5.3 Documents in this folder (Markdown only)

The root `CLAUDE.md` indexes every document below.

| File | Contents |
|---|---|
| `plan.md` | This plan |
| `engineering-standards.md` | Module structure, no-duplication rules, TypeScript and Three.js rules, Cloudflare free-plan rules, git, dependencies, review checklist |
| `dependencies.md` | Version log of every package and GitHub Action |
| `features/<feature>.md` | One file per game feature: behavior, controls, UI, technical design, free-plan budget, edge cases, acceptance criteria and test cases |
| `features/_template.md` | Template every feature doc starts from |

---

## 6. Phases and milestones

### Phase 1 — Flight prototype (current)

Goal: a playable, deployed game with good-feeling flight.

| # | Task | Done when |
|---|---|---|
| 1.1 | Plan and docs folder | This file committed |
| 1.2 | Project setup: Vite + TS + Three.js, pnpm, exact pins, dependency log | `pnpm dev` runs and `pnpm build` passes |
| 1.3 | World: terrain, lake, sky, fog, clouds, factory, pits, trees, rocks, grass | Matches the preview artifact's look |
| 1.4 | Track and gates: spline track, 12 gates, start banner | Gates sit on the track, legs reach the ground |
| 1.5 | Drone model and flight model (altitude hold, tilt physics, turn assist) | Space 2 s gives about 10 m; releasing holds height; W reaches about 60 km/h in 3 s |
| 1.6 | Input: remappable bindings, pointer-lock mouse turn, drag fallback | Every action rebindable; saved across reloads |
| 1.7 | Collisions: ground, water, gate frames, factory, containers, tree trunks | Fast hits crash; slow touches bump |
| 1.8 | Crash and respawn at the last gate | Respawn faces the next gate |
| 1.9 | Cameras: goggles (with lens effects) and chase | C toggles; both show the height gauge |
| 1.10 | HUD: OSD, height gauge, ground line, gate marker, minimap | All values update live |
| 1.11 | Time trial: countdown, gate order, laps, best lap, local ghost | Best lap and ghost survive reload |
| 1.12 | Menu: Free flight, Time trial, Controls, Settings (quality), live AI flyby background | All buttons work |
| 1.13 | Motor sound | Pitch follows throttle |
| 1.14 | Cloudflare config + GitHub Actions deploy | Merge to main deploys automatically |
| 1.15 | Engineering standards, `CLAUDE.md`, one feature doc per Phase 1 feature (with test cases) | Docs committed in `docs/` |
| 1.16 | Battery system: drain, sag, low-power, motors cut at 0%, pad swap, battery gauge; flight model reads `DroneStats` | 3–4 laps per battery at racing pace; empty battery ends a time-trial run |

### Phase 2 — Looks and feel

- Real CC0 textures (grass, dirt, rock, concrete, rust) as KTX2, HDRI sky lighting, real tree and rock models (GLB + meshopt), LOD.
- Better drone model from Blender, prop blur, motor sound layers, wind.
- Training mode lessons.
- Settings: field of view, camera uptilt, invert, units.
- Performance pass: instancing audit, draw-call budget, adaptive quality.

### Phase 3 — Drone setups and progression

- Hangar screen: choose propellers and battery, see stat changes and estimated flight time before equipping.
- Propellers: 2, 3, 4 and 5 blades with speed / grip / lift / drain / wobble trade-offs.
- Batteries: 4S 1100, 1500, 1800 and 6S 1300, with weight affecting lift and acceleration.
- Upgrades (levels 1–3) and credits earned from laps, personal bests and challenges. Saved in the browser.
- Battery Challenge mode: finish N laps on one battery, stars and rewards.
- Spec and Open classes for time trial best laps.

### Phase 4 — Async multiplayer

- Pilot name (no account), stored in the browser.
- Worker API + D1: submit best lap and ghost, fetch leaderboard and friends' ghosts. Separate Spec and Open leaderboards; Open shows the setup.
- Race a friend's ghost from a shared link.
- Sync progress (credits, parts) to D1, one write per session.

### Phase 5 — Live race rooms

- `RaceRoom` Durable Object with WebSocket hibernation.
- Lobby: room code, invite link, ready status, ping, chat.
- Countdown, live positions with interpolation, finish order, results screen, rematch.
- Host picks the class: Spec (everyone on stock parts) or Open (own setups).

### Phase 6 — Growth

- More zones and tracks, track editor with share codes.
- Drone types (racer, freestyle, cinewhoop), more parts (motors, frames), paint shop.
- Freestyle mode with trick scoring.

---

## 7. Performance targets

- 60 fps at 1080p on a mid-range laptop on Medium quality.
- Initial load under 3 MB in Phase 1, under 25 MB in Phase 2 (streamed).
- Draw calls under 150 on Medium (instancing for trees, rocks, grass).

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Flight feels bad on keyboard | Altitude hold, turn assist, tunable constants, early playtests |
| Parts make races unfair or one setup dominates | Spec class for fair races; every part has a real downside; playtest balance before Phase 4 leaderboards |
| Battery feels punishing to beginners | Battery drain can be turned off in free flight; low-battery warning at 20%; generous pack size |
| Low frame rate on older laptops | Quality presets, adaptive quality, instancing, fewer shadows |
| Free-tier limits hit by live races | Lower tick rate, hibernation, peer-to-peer fallback |
| Large assets exceed 25 MiB per file | KTX2 / meshopt compression, split files |
| Pointer lock blocked in some browsers | Drag-to-steer fallback and Q/E keys |
