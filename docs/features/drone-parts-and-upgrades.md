# Feature: Drone Parts and Upgrades

Status: In progress (built, needs playtest)
Phase: 3
Branch: `feat/drone-parts`
Last updated: 2026-11-01

## Summary

Customize the drone in a Hangar: choose propellers (2, 3, 4 or 5 blades) and batteries, each with clear advantages and disadvantages, and upgrade them with credits earned by flying. The choice matters most against the battery: grippy, high-lift props turn beautifully but drain the battery faster.

## Player experience

Open the Hangar. The drone sits on a stand. Pick a propeller set and a battery; stat bars show what changes (green better, red worse) and the estimated flight time updates. Earn credits from laps, personal bests and challenges, then buy new parts or upgrade the ones you have. Fly and feel the difference: 2-blade props are fast and efficient but twitchy; 5-blade props carve smooth, tight turns but empty the battery quickly.

## Behavior and rules

Every part changes the `DroneStats` used by the flight model and battery (see battery-system). Values live in `config.ts` → `PARTS`. Starting values below; tuned in playtests.

### Propellers

| Prop | Blades | Top speed | Grip | Lift | Battery drain | Wobble | Character |
|---|---|---|---|---|---|---|---|
| Swift | 2 | +10% | −25% | −10% | −20% | 0.60 | Fastest and most efficient, but loose and twitchy in turns |
| Allround (stock) | 3 | 0 | 0 | 0 | 0 | 0.15 | Balanced |
| Grip | 4 | −5% | +15% | +10% | +15% | 0.08 | Sharper, steadier turns, stronger climbs |
| Hauler | 5 | −12% | +30% | +20% | +30% | 0.05 | Smoothest and strongest, thirstiest |

How each stat affects flight:

- **Top speed:** air drag is divided by `topSpeedFactor²`, so top speed scales with the factor.
- **Grip:** multiplies tilt response, drift assist and keyboard turn rate (turn rate uses `0.85 + 0.15 × grip`). Low grip = the drone slides and overshoots.
- **Lift:** multiplies climb and descend rates and horizontal acceleration.
- **Battery drain:** multiplies battery current.
- **Wobble:** small, fast random wobble added to pitch and roll (up to 0.04 rad × wobble). This is the "janky" feel of 2-blade props.

### Batteries

| Battery | Cells | Capacity | Weight | Effect |
|---|---|---|---|---|
| Light 1100 | 4S | 1,100 mAh | 140 g | Lighter: +8% lift and acceleration; short flight |
| Standard 1500 (stock) | 4S | 1,500 mAh | 185 g | Balanced |
| Long 1800 | 4S | 1,800 mAh | 215 g | Heavier: −6% lift and acceleration; long flight |
| Punch 1300 | 6S | 1,300 mAh | 220 g | Higher voltage: +12% top speed, +10% lift; +25% drain |

- Drone dry weight: 460 g. All-up weight = dry + battery. Lift and acceleration scale by `stockWeight / allUpWeight` (stock all-up = 645 g).

### Upgrades

Each owned part has levels 1 to 3.

| Part | Level 2 | Level 3 |
|---|---|---|
| Propellers | −5% drain, −20% wobble | −10% drain, −40% wobble |
| Batteries | +10% capacity (same weight) | +20% capacity |

### Credits

| Earned for | Credits |
|---|---|
| Completing a lap (any mode with laps) | 10 |
| New personal best lap | 50 |
| Battery Challenge stars | 100 per star (first time per challenge) |

| Item | Price |
|---|---|
| Swift 2-blade / Grip 4-blade | 300 each |
| Hauler 5-blade | 600 |
| Light 1100 / Long 1800 | 200 / 400 |
| Punch 1300 (6S) | 900 |
| Upgrade to level 2 / level 3 | 150 / 400 |

### Fair racing (classes)

- **Spec class:** stock parts, no upgrades. Everyone flies the same drone.
- **Open class:** any setup. The setup is shown next to the time.
- Time trial saves best laps per class. Leaderboards (Phase 4) and live rooms (Phase 5) let the host pick the class. Ghost data stores the setup.

## UI

- **Hangar screen:** drone on a stand (drag to spin), part tabs (Propellers, Battery), part cards (owned, price, level), stat bars (Speed, Grip, Lift, Flight time) with before/after preview, credit balance, Buy and Upgrade buttons, Fly this drone.
- **Menu:** Hangar button with the current setup ("Allround 3-blade · Standard 1500").
- Flight HUD shows the setup name in the race panel.

## Technical design

- `src/drone/parts.ts`: part catalog types and lookup (`PropPart`, `BatteryPart`, levels), read from `config.ts` → `PARTS`.
- `src/drone/drone-stats.ts`: `buildStats(setup: DroneSetup): DroneStats`, the only place where part effects are combined. Flight model, battery and hangar all call this; nobody recombines stats elsewhere.
- `src/game/progress.ts`: credits, owned parts and levels, current setup; `earn(reason)`, `buy(partId)`, `upgrade(partId)`; saved in `localStorage` key `pw.progress.v1`; synced to D1 in Phase 4.
- `src/ui/hangar.ts`: hangar screen; flight-time preview uses `Battery.estimateSecondsLeft` with a standard racing effort profile (same code as the in-flight estimate).
- `src/drone/drone-model.ts`: blade count changes the prop mesh (2–5 blades); battery size changes the battery mesh.

## Cloudflare free-plan budget

Phase 3 is local only (no server). Phase 4 sync:

| Resource | Estimated daily use | Free limit | OK? |
|---|---|---|---|
| Worker requests | 1 progress sync per session × ~200 sessions | ~100k/day | Yes |
| D1 rows written | ~200 | ~100k/day | Yes |
| D1 rows read | ~400 | ~5M/day | Yes |

## Edge cases

- Not enough credits: Buy disabled, shows how many more are needed.
- Corrupt progress data: reset to stock with 0 credits; warn once.
- Changing setup mid-session: only from the Hangar (not in flight).
- Old best laps: saved per class; Open-class laps record the setup.

## Acceptance criteria

- [ ] Each prop feels different in flight in the way the table describes (playtest).
- [ ] Stat bars and flight-time estimate update before buying or equipping.
- [ ] Hauler 5-blade gives clearly fewer laps per battery than Swift 2-blade at the same pace.
- [ ] Credits are earned and spent correctly and survive reload.
- [ ] Spec-class time trial ignores the equipped setup and uses stock parts.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `buildStats(stock)` | Equals `STOCK_STATS` | Unit |
| 2 | `buildStats({ prop: 'hauler', battery: 'standard' })` | grip 1.30, lift 1.20, drain 1.30, topSpeed 0.88 | Unit |
| 3 | `buildStats({ prop: 'swift', propLevel: 3 })` | drain 0.80 × 0.90, wobble 0.60 × 0.60 | Unit |
| 4 | Buy with too few credits | Rejected, balance unchanged | Unit |
| 5 | Equip Swift, fly a lap; equip Hauler, fly a lap | Swift faster and looser; Hauler smoother and drains more | Manual |
| 6 | Earn credits, reload | Balance and owned parts kept | Manual |

## Implementation notes (Phase 3 build)

- Built: part catalog and `buildStats` (`src/drone/parts.ts`, tuning in `config.ts` `PARTS`), `Progress` (credits, buy, upgrade, equip, saved in `pw.progress.v1`), the Hangar screen, credits for laps and personal bests.
- **Class rule, simplified:** the equipped setup applies in **Free flight and Battery Challenge only**. Time trial, training and live races always use the stock drone (the Spec class), so best laps, leaderboards and ghosts stay comparable and nothing in Phase 4 or 5 needed to change. Open-class time trial, setup-tagged ghosts and a host-picked class are not built.
- Dry weight is 457 g so the stock all-up weight matches the flight model's 0.642 kg.
- Not built: 3D prop and battery meshes that change with the setup (the drone model still draws 3 blades), drag-to-spin stand, syncing progress to D1.
- Not verified: how each prop feels in the air (needs a human), balance of prices and credit income.

## Out of scope

Motors, frames and cameras as parts; paint shop; drone types (racer, freestyle, cinewhoop) (Phase 6).

## Changelog

- 2026-11-01: Created from the product owner's propeller and battery upgrade idea.
