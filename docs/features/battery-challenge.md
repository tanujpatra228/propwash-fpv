# Feature: Battery Challenge

Status: In progress (built, needs playtest)
Phase: 3
Branch: `feat/battery-challenge`
Last updated: 2026-11-01

## Summary

A game mode built on the battery: finish the laps before the battery dies. Choosing the right propellers and battery is part of the challenge.

## Player experience

Pick a challenge, for example "Three on a pack: finish 3 laps before your battery runs out." Choose your setup in the Hangar, fly, and watch the battery as closely as the clock. Run out before the line and the run fails. Finish with battery to spare or under par time to earn more stars and credits.

## Behavior and rules

- Uses the battery system (one battery, no swap) and the time-trial lap rules (gates in order).
- **Fail:** battery reaches 0% before the last lap is complete.
- **Stars per challenge:** 1 star finish; 2 stars finish with at least 15% battery left; 3 stars finish under the par time.
- Credits: 100 per star, the first time each star is earned (see drone-parts-and-upgrades).
- Challenges (in `config.ts` → `CHALLENGES`):

| Challenge | Goal | Par time | Notes |
|---|---|---|---|
| Three on a pack | 3 laps | 2:30 | Easy with the stock setup |
| Five on a pack | 5 laps | 4:10 | Needs an efficient setup and smooth flying |
| Heavy sprint | 2 laps | 1:25 | Hauler 5-blade required |
| Endurance | As many laps as possible | — | Score = laps + fraction of the last lap; personal best saved |

- Respawns after a crash cost time and don't refill the battery.

## UI

- Challenge list (from the menu): name, goal, stars earned, best result, required parts.
- In flight: race panel shows "Lap n / N" and a projected finish line on the battery gauge ("Battery needed ≈ 62%"), based on the average drain per lap so far.
- Result banner: success or "Out of battery on lap 4", stars, credits.

## Technical design

- `src/game/modes/battery-challenge.ts`: composes the time-trial lap tracker and the battery; no copy of lap or battery logic.
- Challenge definitions in `config.ts`; results in `pw.challenges.v1` via `core/storage.ts`.
- "Battery needed" projection uses `Battery` drain history (shared with the in-flight time estimate).

## Edge cases

- Battery empties while crossing the final gate: counts if the gate is crossed before charge hits 0.
- Required part not owned: challenge locked with a "Get the Hauler 5-blade in the Hangar" hint.

## Acceptance criteria

- [ ] Running out before the final lap fails the run.
- [ ] Stars and credits are awarded once per star and saved.
- [ ] Endurance saves the best score.
- [ ] Locked challenges explain what's needed.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Challenge logic: 3 laps done at 20% charge, under par | 3 stars | Unit |
| 2 | Battery hits 0 on lap 3 of 3 | Fail | Unit |
| 3 | Complete "Three on a pack" twice | Credits only the first time per star | Manual |
| 4 | Open "Heavy sprint" without the Hauler | Locked with hint | Manual |

## Implementation notes (Phase 3 build)

- Built: four challenges with stars, credits, saved records (`pw.challenges.v1`), locks with a hint, Endurance score. The challenge list is a dialog from the menu.
- Not built: the "battery needed" projection on the gauge, a per-challenge best result shown beyond stars and Endurance score.
- Par times and the Heavy sprint requirement are first guesses and need a playtest.

## Out of scope

Online challenge leaderboards (Phase 4), weekly challenges.

## Changelog

- 2026-11-01: Created from the product owner's battery idea.
