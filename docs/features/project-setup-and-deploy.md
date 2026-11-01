# Feature: Project Setup and Deploy

Status: Planned
Phase: 1
Branch: `chore/project-setup`
Last updated: 2026-11-01

## Summary

The tooling every other feature builds on: a Vite + TypeScript + Three.js project managed with pnpm, exact-pinned dependencies, and automatic deployment of `main` to the Cloudflare Workers free plan through GitHub Actions.

## Player experience

Players open one URL (`https://propwash-fpv.<account>.workers.dev`) and the game loads. Every merge to `main` updates that URL within a few minutes.

## Behavior and rules

- **Package manager:** pnpm `10.34.5` (pinned in `package.json` `packageManager`). npm and yarn are not used.
- **Versions:** every dependency is an exact version. `.npmrc` sets `save-exact=true` and `engine-strict=true`. Node `>=22`.
- **Dependency log:** `docs/dependencies.md` lists every package and GitHub Action with version, purpose and date.
- **Build scripts** (needed by `vite` and `wrangler`): `esbuild` and `workerd` are approved in `package.json` → `pnpm.onlyBuiltDependencies`. No other package may run install scripts without being added there on purpose.
- **Scripts:**

| Script | Does |
|---|---|
| `pnpm dev` | Vite dev server with live reload |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm build` | Typecheck, then `vite build` into `dist/` |
| `pnpm preview` | Serve `dist/` locally |
| `pnpm cf:dev` | Build, then run locally on the Workers runtime (`wrangler dev`) |
| `pnpm deploy` | Build and `wrangler deploy` (manual fallback; CI normally deploys) |

## Technical design

- `tsconfig.json`: `strict`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit`, `isolatedModules`, DOM libs.
- `vite.config.ts`: output to `dist/`, `build.target: es2022`, Three.js split into its own chunk so game updates don't re-download the engine.
- `wrangler.jsonc`: assets-only Worker (no script). `assets.directory: "./dist"`, `not_found_handling: "single-page-application"`, a fixed `compatibility_date`.
- `.github/workflows/deploy.yml`:
  - Triggers: push to `main` (build + deploy), pull requests to `main` (build only), manual run.
  - Steps: checkout → pnpm setup (version from `packageManager`) → Node 22 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm build` → `cloudflare/wrangler-action` deploy (main only).
  - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions secrets).
  - All actions pinned to exact release tags and logged in `docs/dependencies.md`.
- `index.html` loads fonts from Google Fonts and the entry `src/main.ts`.

## Cloudflare free-plan budget

| Resource | Estimated daily use | Free limit | OK? |
|---|---|---|---|
| Static asset requests | Any amount | Free, unlimited | Yes |
| Worker script requests | 0 (no script in Phase 1) | ~100k/day | Yes |
| Largest file | < 1 MB (JS bundle) | 25 MiB | Yes |
| Files per deploy | < 50 | 20,000 | Yes |

## Edge cases

- Missing or wrong Cloudflare secrets: the deploy step fails, the workflow run is red, and the live site keeps the previous version.
- Lockfile out of date: `--frozen-lockfile` fails the build so drift never ships.
- `pnpm install` without approved build scripts: `esbuild`/`workerd` binaries missing; fixed by `onlyBuiltDependencies`.

## Acceptance criteria

- [ ] `pnpm install`, `pnpm dev`, `pnpm typecheck` and `pnpm build` work on a clean clone.
- [ ] `package.json` has no `^` or `~` versions.
- [ ] `docs/dependencies.md` lists every package and action with exact versions.
- [ ] A push to `main` runs the workflow and deploys; the workers.dev URL serves the game.
- [ ] A pull request runs build only, no deploy.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Clean clone → `pnpm install --frozen-lockfile` → `pnpm build` | Succeeds, `dist/index.html` exists | Manual / CI |
| 2 | `grep -E '"\^|"~' package.json` | No matches | Manual |
| 3 | Merge a branch into `main` | Actions run is green; site updated | Manual |
| 4 | Open a PR to `main` | Build runs; deploy step skipped | Manual |
| 5 | `pnpm cf:dev`, open the local URL | Game loads on the Workers runtime | Manual |

## Out of scope

Worker API routes, D1 and Durable Objects (Phase 3–4). Custom domain.

## Changelog

- 2026-11-01: Created.
