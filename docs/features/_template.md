# Feature: <Name>

Status: Planned | In progress | Done
Phase: <1–6>
Branch: `feat/<name>`
Last updated: YYYY-MM-DD

<!--
Copy this file to docs/features/<feature-name>.md (kebab-case) before writing any code
for the feature. Keep it updated in the same branch as the code. Delete sections that
truly don't apply, but keep "Acceptance criteria" and "Test cases".
-->

## Summary

One or two sentences: what the player gets and why it matters.

## Player experience

What the player sees, hears and does, step by step, in plain language.

## Behavior and rules

- Exact rules, numbers and states (link to `src/config.ts` keys for tunable values).
- What happens in each state and how it moves to the next.

## Controls

| Action | Default key | Notes |
|---|---|---|

(Only if the feature adds or changes controls. New actions go in `input/key-bindings.ts`.)

## UI

Screens, HUD elements, text, colors (by CSS token), and where they appear.

## Technical design

- Modules touched or added (`src/...`) and what each one does.
- Data shapes (interfaces), stored data (`localStorage` keys), network messages.
- Shared helpers reused (see engineering standards §4). Note anything new that becomes shared.

## Cloudflare free-plan budget

Only if the feature uses Cloudflare (Worker routes, D1, Durable Objects, KV).

| Resource | Estimated daily use | Free limit | OK? |
|---|---|---|---|

## Edge cases

- Storage blocked, pointer lock refused, tab hidden, very low frame rate, window resize, etc.

## Acceptance criteria

- [ ] Concrete, checkable statement of done.

## Test cases

| # | Steps | Expected result | Type (manual / unit) |
|---|---|---|---|
| 1 | | | |

## Out of scope

What this feature deliberately does not do (and which later feature will).

## Changelog

- YYYY-MM-DD: Created.
