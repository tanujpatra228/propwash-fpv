# Dependencies

Version log of every package and GitHub Action. Exact versions only. Add a row in the same commit that adds, upgrades or removes a dependency.

## Tooling

| Tool | Version | Purpose | Added |
|---|---|---|---|
| Node.js | >=22 (CI: 22) | Runtime for build tools | 2026-11-01 |
| pnpm | 10.34.9 | Package manager (`packageManager` in `package.json`) | 2026-11-01 |

## Runtime packages

| Package | Version | Purpose | Added | Notes |
|---|---|---|---|---|
| three | 0.187.0 | 3D engine | 2026-11-01 | The preview artifact used 0.160.0; check addon imports (`Sky`, `OutputPass`, `UnrealBloomPass`) when porting |

## Dev packages

| Package | Version | Purpose | Added |
|---|---|---|---|
| @types/three | 0.187.0 | Three.js types, matches `three` | 2026-11-01 |
| typescript | 7.0.2 | Type checking (`tsc --noEmit`) | 2026-11-01 |
| vite | 8.3.5 | Dev server and production build | 2026-11-01 |
| vitest | 5.0.5 | Unit tests for pure logic | 2026-11-01 |
| @cloudflare/workers-types | 5.20261101.1 | Types for the Worker (`worker/`), typechecked by `tsc -p worker/tsconfig.json` | 2026-11-01 |
| wrangler | 4.156.0 | Cloudflare Workers CLI (local run, manual deploy) | 2026-11-01 |

## GitHub Actions

| Action | Version | Purpose | Added |
|---|---|---|---|
| actions/checkout | v7.0.1 | Check out the repo | 2026-11-01 |
| pnpm/action-setup | v6.1.0 | Install pnpm from `packageManager` | 2026-11-01 |
| actions/setup-node | v7.1.0 | Node 22 with pnpm cache | 2026-11-01 |
| cloudflare/wrangler-action | v4.1.3 | Deploy `dist/` to Cloudflare Workers | 2026-11-01 |

## Changelog

- 2026-11-01: Initial set.
