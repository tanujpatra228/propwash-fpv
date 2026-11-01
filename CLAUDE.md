# Propwash FPV

Browser FPV drone racing game. Three.js + TypeScript + Vite, deployed to the **Cloudflare Workers free plan** (free plan only, no paid features, ever).

## Read these first

| Document | What it covers |
|---|---|
| [docs/plan.md](docs/plan.md) | Goals, game design, architecture, phases and milestones |
| [docs/engineering-standards.md](docs/engineering-standards.md) | How we write code: modules, no duplication, TypeScript, Three.js, Cloudflare free-plan rules, git, dependencies, review checklist |
| [docs/phase-1-implementation-plan.md](docs/phase-1-implementation-plan.md) | Phase 1 build order: milestones M1 to M8, tests per milestone, risks, open questions |
| [docs/phase-1-acceptance.md](docs/phase-1-acceptance.md) | What is verified, how, and what is still open for Phase 1 |
| [docs/dependencies.md](docs/dependencies.md) | Version log of every package and GitHub Action (created with the first code commit) |
| [docs/features/](docs/features/) | One Markdown file per game feature: behavior, design, acceptance criteria, test cases |
| [docs/features/_template.md](docs/features/_template.md) | Template for new feature docs |

## Feature docs

Each feature gets its own file in `docs/features/`, written from the template before its code. Add a row here when you create one.

| Feature | Doc | Phase | Status |
|---|---|---|---|
| Project setup and deploy | [project-setup-and-deploy.md](docs/features/project-setup-and-deploy.md) | 1 | In progress |
| World and environment | [world-and-environment.md](docs/features/world-and-environment.md) | 1 | In progress |
| Track and gates | [track-and-gates.md](docs/features/track-and-gates.md) | 1 | In progress |
| Drone model | [drone-model.md](docs/features/drone-model.md) | 1 | In progress |
| Flight model | [flight-model.md](docs/features/flight-model.md) | 1 | Done |
| Controls and key bindings | [controls-and-key-bindings.md](docs/features/controls-and-key-bindings.md) | 1 | In progress |
| Cameras and FPV effects | [cameras-and-fpv-effects.md](docs/features/cameras-and-fpv-effects.md) | 1 | In progress |
| Height indicator | [height-indicator.md](docs/features/height-indicator.md) | 1 | In progress |
| HUD and OSD | [hud-and-osd.md](docs/features/hud-and-osd.md) | 1 | In progress |
| Collisions and crash | [collisions-and-crash.md](docs/features/collisions-and-crash.md) | 1 | In progress |
| Time trial and ghost | [time-trial-and-ghost.md](docs/features/time-trial-and-ghost.md) | 1 | In progress |
| Free flight | [free-flight.md](docs/features/free-flight.md) | 1 | In progress |
| Main menu and settings | [main-menu-and-settings.md](docs/features/main-menu-and-settings.md) | 1 | In progress |
| Motor sound | [motor-sound.md](docs/features/motor-sound.md) | 1 | In progress |
| Battery system | [battery-system.md](docs/features/battery-system.md) | 1 | In progress |
| Drone parts and upgrades | [drone-parts-and-upgrades.md](docs/features/drone-parts-and-upgrades.md) | 3 | Planned |
| Battery Challenge | [battery-challenge.md](docs/features/battery-challenge.md) | 3 | Planned |

## Working rules (summary; details in the standards)

- **Docs:** `docs/` holds Markdown files only. Create or update the feature doc in the same branch as the code.
- **Modular, no duplication:** search for existing helpers before writing new ones; shared logic lives in its one home (`src/config.ts`, `src/core/*`, `src/world/terrain.ts`, `src/world/track.ts`, `src/input/key-bindings.ts`, `src/game/lap-tracker.ts`).
- **Layers:** `config → core → physics / world / input → drone → ui → game → main`. Never import against the arrow.
- **Free plan only:** client does the heavy work; no per-frame server calls; any Cloudflare usage needs a free-plan budget note in its feature doc.
- **pnpm only** (never npm or yarn). **Exact versions** (`pnpm add -E pkg@x.y.z`), and log every package in `docs/dependencies.md`.
- **Git:** one branch per phase (`feat/phase-1`) with many small commits, each prefixed with its milestone (`M1: ...`); other fixes and doc updates get `fix/` or `docs/` branches → push → periodically merge into `main` with a merge-commit PR (auto-deploys to Cloudflare via GitHub Actions) → confirm the deploy. Keep the phase branch until the phase is complete, then delete it locally and on GitHub; delete `fix/` and `docs/` branches right after their merge.
- **Secrets:** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` live only in GitHub Actions secrets. Never commit them.

## Commands

```bash
pnpm install        # install exact-pinned dependencies
pnpm dev            # local dev server with live reload
pnpm typecheck      # TypeScript check
pnpm build          # typecheck + production build into dist/
pnpm cf:dev         # run the built game locally on the Workers runtime
pnpm deploy         # manual deploy (normally done by GitHub Actions on merge to main)
```
