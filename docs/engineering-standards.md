# Engineering Standards

Last updated: 2026-11-01

These rules apply to every line of code, config and doc in this repo. They exist so the code stays clean, modular and easy to change, and so the same logic is never written twice. If a rule gets in the way, change the rule in this file first (in its own commit), then write the code.

---

## 1. Core principles

1. **One job per module.** A file does one thing and its name says what. If you need "and" to describe it, split it.
2. **Write it once.** Every piece of logic, constant and type has exactly one home. Before writing a function, search for an existing one (see §4).
3. **Pure logic first.** Game rules (flight physics, lap timing, gate order, bindings, scoring) are plain TypeScript functions or classes with no DOM and no Three.js scene access where possible. They are easy to test and reuse on the server later.
4. **Data over code.** Tunable values, track layouts, key bindings, colors and quality presets live in config objects, not scattered through logic.
5. **Simple beats clever.** Readable code with clear names wins over short or "smart" code.
6. **Free tier only.** Every server-side choice must fit the Cloudflare free plan (§2). No exceptions.

---

## 2. Cloudflare free plan: hard rules

We only use the **Cloudflare free plan**. No paid plan, no paid add-ons, no feature that needs a payment method on file. Any change that touches Cloudflare must be checked against these limits. The numbers below are approximate; confirm them on Cloudflare's pricing pages before building something that depends on them.

### 2.1 Allowed products and limits (free plan)

| Product | Use in Propwash | Free limits to respect |
|---|---|---|
| Workers static assets | Serve the game (HTML, JS, textures, models) | Asset requests are free and unlimited; max 25 MiB per file; max 20,000 files per deploy |
| Workers (scripts) | Small JSON API (Phase 4+) | ~100,000 requests/day; ~10 ms CPU per request; ~3 MB compressed bundle |
| D1 | Leaderboards, best laps, ghosts (Phase 4+) | ~5M rows read/day, ~100k rows written/day, ~5 GB storage |
| Durable Objects (SQLite-backed only) | One live race room per object (Phase 5) | ~100k requests/day, ~13,000 GB-s duration/day; WebSocket messages billed at ~1/20 of a request |
| KV | Only if truly needed (read-heavy, rarely written data) | ~100k reads/day, ~1,000 writes/day |

### 2.2 Not allowed

- Workers Paid plan features, Workers Unbound, paid Durable Object storage backends.
- Any product without a free tier, or one that needs a credit card (do not use R2 unless confirmed usable on the free plan without a payment method).
- Server-side rendering, image transformations, or heavy CPU work in a Worker.

### 2.3 Design rules that keep us inside the limits

1. **Do work in the browser.** Physics, rendering, ghost playback and lap timing all run client-side. The server only stores and relays small data.
2. **No per-frame server calls.** Never call the API from the game loop. Batch: one request per finished lap, per leaderboard view, per room join.
3. **Small payloads.** Ghost data is compressed (quantized positions, 10–20 samples/second), target under 20 KB per lap.
4. **Live rooms:** clients send 10–15 updates/second (not 60). Use WebSocket hibernation. Close idle rooms.
5. **Cache what you can.** Leaderboards and static data use HTTP cache headers so repeat views don't hit the Worker.
6. **Budget check required.** Any new endpoint or Cloudflare product needs a short free-tier calculation (requests/day, rows/day, GB-s/day) in its feature doc before code is written.
7. **Rate limit in code.** Endpoints reject obviously excessive use (for example, more than one lap submission per few seconds per pilot) so one buggy client can't burn the daily quota.

---

## 3. Project structure and module boundaries

```
src/
├─ main.ts        Entry point only: find the canvas, create Game, start it
├─ config.ts      All tunable constants and presets (single source of truth)
├─ core/          Shared, domain-free helpers: math, noise, storage, DOM, format, audio, renderer
├─ world/         Everything static in the scene: terrain, water, sky, track, gates, scenery, textures
├─ physics/       Collision shapes, queries and collision response
├─ drone/         Drone model, flight model, track-following AI, ghost record/playback
├─ input/         Action bindings and keyboard/mouse input
├─ ui/            HUD, menus, panels (DOM only)
└─ game/          Game state machine and main loop (game.ts), camera rig, lap tracker, modes/ (free flight, time trial)
```

### 3.1 Dependency direction

Imports flow one way. A layer may import from layers to its left, never to its right:

```
config  →  core  →  physics / world / input  →  drone  →  ui  →  game  →  main
```

- `config.ts` imports only types. `core/` imports nothing from the project except `config.ts`.
- `ui/` never changes game state directly. It calls functions or callbacks that `game/` gives it.
- `game/game.ts` is the only place that knows about every system.
- **No circular imports.** If two modules need each other, the shared part moves down a layer.

### 3.2 File rules

- One main export per file (a class, or a small group of closely related functions).
- Target under 300 lines per file. Over 400 means it should be split.
- File names: `kebab-case.ts` (for example `flight-model.ts`, `key-bindings.ts`).
- No "utils" junk drawer. Helpers go in a named module (`core/math.ts`, `core/storage.ts`, `core/dom.ts`).
- No barrel files (`index.ts` that re-exports everything). Import from the real file.

---

## 4. Write it once (no duplicated logic)

### 4.1 Before writing new code

1. Search the codebase (`src/`) for an existing function, constant or type that does the job.
2. Check the "shared homes" table below.
3. If something close exists, extend it (add a parameter) instead of copying it.

### 4.2 Shared homes

| What | Where | Examples |
|---|---|---|
| Tunable numbers | `src/config.ts` | Drag, climb rate, gate size, colors, quality presets, HUD thresholds |
| Math and noise | `src/core/math.ts` | `clamp`, `smoothstep`, `lerp`, `damp`, `fbm`, `randRange` |
| Browser storage | `src/core/storage.ts` | `loadJson`, `saveJson` (always try/catch) |
| DOM access | `src/core/dom.ts` | `mustGet(id)`, `el(tag, attrs)` |
| Terrain height | `src/world/terrain.ts` | `heightAt(x, z)`, `groundY(x, z)` |
| Track queries | `src/world/track.ts` | `sampleAt`, `poseAt`, `nearestSample` |
| Key names and actions | `src/input/key-bindings.ts` | `ACTIONS`, `keyLabel`, `actionFor` |
| Time formatting | `src/core/format.ts` | `formatLapTime`, `formatHeight` |
| UI colors and fonts | `src/style.css` `:root` tokens | `--gate`, `--ok`, `--bad`, `--osd` |

### 4.3 Rules

- **Rule of two:** the second time you need the same logic, extract it into the shared home. Don't wait for a third copy.
- **No magic numbers** in logic. Name them in `config.ts` (or as a named constant at the top of the file if truly local), with the unit in the name.
- **One source of truth for data.** The track, gate list, bindings and presets are defined once and read everywhere. Never keep a second copy that can drift.
- **Same concept, same name** everywhere (for example always `heightM`, never `alt` in one file and `elevation` in another).
- Copy-paste between files is a review blocker.

---

## 5. TypeScript rules

- `strict: true`. No `any`. Use `unknown` and narrow it.
- Exported functions have explicit parameter and return types.
- Shapes of data use `interface` or `type`. Fixed sets use string literal unions (`'free' | 'trial'`), not `enum`.
- Config objects are `as const` or `Readonly<...>`.
- No non-null assertions (`!`) except through a helper that throws a clear error (`mustGet`).
- Handle `null` and `undefined` explicitly. Parse anything from `localStorage` or the network as `unknown` and validate it.
- Prefer `const`. No `var`.
- Small classes are fine for things with state and a lifecycle (`FlightModel`, `Hud`). Plain functions for everything else.

---

## 6. Naming

| Thing | Style | Example |
|---|---|---|
| Files | kebab-case | `height-gauge.ts` |
| Classes, types, interfaces | PascalCase | `FlightModel`, `GateState` |
| Functions, variables | camelCase | `stepFlight`, `nextGateIndex` |
| Constants in config | UPPER_SNAKE or camelCase keys in a const object | `CLIMB_RATE_MPS`, `FLIGHT.climbRateMps` |
| Booleans | `is` / `has` / `can` prefix | `isCrashed`, `hasPointerLock` |
| Units | Suffix with the unit | `speedMps`, `heightM`, `angleRad`, `timeS`, `durationMs` |

Names describe what something is to the player or the game, not how it's built (`resetToLastGate`, not `setPosFromArr2`).

---

## 7. Game and Three.js rules

### 7.1 World conventions

- Units: metres, seconds, radians. Convert only for display (km/h, degrees) in the UI layer.
- Axes: Y is up, −Z is forward for drones and cameras (Three.js default).
- The world is deterministic: the same seed gives the same valley for every player (needed for fair leaderboards).

### 7.2 Main loop

- Every update takes `dt` in seconds and is frame-rate independent. Clamp `dt` (for example to 1/20 s) and guard against `dt <= 0`.
- Use exponential smoothing via `damp(current, target, rate, dt)` from `core/math.ts`, never `lerp(a, b, 0.1)` per frame.
- Order each frame: input → simulation → collisions → game rules → camera → HUD → render.
- Systems expose `update(dt)` and read shared state. They do not reach into each other's internals.

### 7.3 Performance

- **No allocations in the hot loop.** Reuse module-level scratch vectors (`const tmpVec = new Vector3()`), don't `new` inside `update`.
- **Instancing** for anything repeated more than ~20 times (trees, rocks, grass).
- Share geometries and materials. Create once, reuse.
- **Dispose** geometries, materials, textures and render targets when something is removed.
- Budgets (Medium quality, 1080p, mid-range laptop): 60 fps, under 150 draw calls, one shadow-casting light.
- DOM updates from the loop are throttled (for example every 3rd frame for text) and only touch `textContent` or `style.transform`.

### 7.4 Input

- Game code asks for **actions** (`'up'`, `'forward'`), never raw keys. Only `input/` knows about key codes.
- New actions are added to the `ACTIONS` table in `input/key-bindings.ts` and automatically appear in the Controls panel.

---

## 8. UI and CSS

- All colors, fonts and spacing are CSS custom properties on `:root` in `style.css`. No hard-coded colors in TS.
- TS sets `textContent`, toggles classes or `hidden`, and sets `style.transform`. No inline style strings beyond dynamic values.
- Build DOM with `core/dom.ts` helpers. Never insert user-provided text with `innerHTML`.
- Visible keyboard focus on every control. Every input has a label.
- Copy is plain language from the player's side ("Go up", "Reset to last gate").

---

## 9. Errors and storage

- `localStorage` access only through `core/storage.ts`, wrapped in try/catch. The game must work when storage is blocked.
- Fail soft: a missing sound, blocked pointer lock or failed save never breaks the game. Log once with `console.warn` and continue.
- Network calls (Phase 4+) have timeouts, handle offline mode, and never block the game loop.

---

## 10. Testing

- Pure logic (math, flight model, lap and gate rules, bindings, ghost encoding) gets unit tests. Vitest will be added when the first test is written; it must be logged in `docs/dependencies.md`.
- Every feature doc lists acceptance criteria. Test cases live in the feature doc's "Test cases" section.
- Before merging: `pnpm typecheck` and `pnpm build` pass, and the feature's test cases are run in the browser.

---

## 11. Git and deployment

- **Branches:** one per feature: `feat/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) style: `feat: add height gauge`, `fix: stop NaN on zero frame time`. Small, focused commits.
- **Merge flow:** push branch → merge into `main` → GitHub Actions deploys to Cloudflare → confirm the deploy passed → delete the branch locally and on GitHub.
- `main` must always build and deploy.
- **Never commit secrets.** Cloudflare credentials live only in GitHub Actions secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) and local `.dev.vars` (git-ignored).
- Commit `pnpm-lock.yaml` with every dependency change.

---

## 12. Dependencies

- **pnpm only.** Never run `npm install` or `yarn`.
- **Exact versions only** (`pnpm add -E pkg@x.y.z`). No `^` or `~`. `.npmrc` enforces `save-exact=true`.
- **Log every package** (and every GitHub Action version) in `docs/dependencies.md`: name, exact version, dev or runtime, purpose, date added, and a note on any upgrade.
- Add a package only when it saves real work. Small helpers are written in `core/` instead.
- Check license (MIT, Apache-2.0, BSD or similar) and bundle size before adding a runtime package.
- Upgrades are their own commit, with the reason logged.

---

## 13. Documentation

- `docs/` contains Markdown files only.
- Every feature has its own file in `docs/features/`, created from `docs/features/_template.md` **before** the feature's code is written, and updated in the same branch as the code.
- `CLAUDE.md` at the repo root is the index of all docs. Add new docs to it.
- Code comments explain **why**, not what. Public functions get a one-line summary when the name isn't enough.

---

## 14. Review checklist (before every merge)

- [ ] Feature doc exists and matches what was built
- [ ] No duplicated logic; shared helpers used (§4)
- [ ] Imports follow the dependency direction; no cycles (§3.1)
- [ ] No magic numbers; units in names (§4.3, §6)
- [ ] No allocations in the game loop; disposables disposed (§7.3)
- [ ] Input goes through actions (§7.4)
- [ ] Cloudflare usage fits the free plan, with a budget note in the feature doc (§2)
- [ ] New packages pinned and logged (§12)
- [ ] `pnpm typecheck` and `pnpm build` pass; feature test cases pass
