# Feature: Battery System

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M2 (pure model); game rules in M6)
Last updated: 2026-11-01

## Summary

The drone runs on a real battery that drains as you fly. Flying hard drains it faster, a low battery makes the drone weaker, and an empty battery cuts the motors. This makes the battery readouts meaningful and sets up drone parts and upgrades (see drone-parts-and-upgrades, Phase 3).

## Player experience

- The battery gauge drains as you fly; climbing hard and flying fast drain it quickest, gentle hovering lasts much longer.
- Below 20% a "LOW BATTERY" warning blinks and the drone gets noticeably weaker (slower, climbs less).
- At 0% the motors cut and the drone drops.
- **Time trial:** one battery per run. Fly as many good laps as the battery allows; when it's empty the run is over.
- **Free flight:** land on the pad to swap in a fresh battery. Learners can turn battery drain off in Settings.

## Behavior and rules

All values in `config.ts` → `BATTERY` (stock setup). Parts change them via `DroneStats` (see below).

### Pack

| Value | Stock |
|---|---|
| Cells | 4S (4 cells in series) |
| Capacity | 1,500 mAh |
| Cell voltage at rest by charge | 100% 4.20 V · 80% 3.95 V · 50% 3.80 V · 20% 3.65 V · 10% 3.55 V · 0% 3.30 V (linear between points) |
| Internal resistance (whole pack) | 0.012 Ω (voltage sag = current × resistance) |

### Current draw

```
effort  = clamp01(0.45 × tilt / maxTilt + 0.35 × climbInput + 0.20 × (speed / topSpeed)²)
current = (8 A + 42 A × effort^1.5) × stats.drainFactor
charge -= current × dt / 3600 / capacityAh
```

- Hover ≈ 8 A (about 11 minutes of pure hovering).
- Racing pace ≈ 35 A average (about 2.5–3 minutes, 3–4 laps of Valley Sprint).
- Gentle cruising: about 5–6 minutes.
- These targets are tuned in playtests; the formula stays, the numbers move.

### Low and empty battery

| Charge | Effect |
|---|---|
| ≥ 20% | Full power |
| < 20% | "LOW BATTERY" blinks (OSD and battery gauge turn yellow); power factor `0.6 + 2 × charge`, so 100% → 60% at empty. Power factor scales top speed (via thrust) and climb rate |
| 0% | "BATTERY EMPTY": motors cut. No thrust, no input, drone falls under gravity with drag. Motor sound stops |

When the motors cut:
- **Time trial:** the run ends when the drone touches the ground (or after 3 s): "Battery empty · 3 laps · best 0:45.27". Best lap and ghost are kept if set.
- **Free flight:** on touching the ground (or after 3 s), the drone respawns on the pad with a fresh battery.

### Battery swap (free flight)

- Land on the pad: height < 0.15 m, within 1.4 m of the pad centre, speed < 0.5 m/s.
- Hold for 2 s (a ring fills around the battery gauge), then "Fresh battery" and charge = 100%.

### Settings

- **Battery drain in free flight:** On (default) / Off. Off keeps charge at 100% in free flight only.
- Time trial always uses the battery (fair times).

### Not refilled by

Crash respawn, Reset to last gate (R), or pausing. Countdown does not drain.

## UI

- **OSD (goggles):** voltage (live, with sag), mAh used, "LOW BATTERY" blink below 20%. Replaces the display-only model in hud-and-osd.
- **Battery gauge (both cameras):** next to the height gauge: percentage, a horizontal bar, estimated time left at the current average draw (`≈ 1:20`). Green ≥ 50%, yellow 20–50%, red < 20%.
- **Banners:** "Low battery" (once at 20%), "Battery empty", "Fresh battery".
- Swap progress ring around the battery gauge while landed on the pad.

## Technical design

- `src/drone/drone-stats.ts`: `DroneStats` interface and `STOCK_STATS` (Phase 1 uses only stock).

```ts
interface DroneStats {
  topSpeedFactor: number;   // scales top speed (via drag)
  gripFactor: number;       // tilt response, turn rate, drift assist
  liftFactor: number;       // climb rate and acceleration
  drainFactor: number;      // battery current multiplier
  wobble: number;           // 0..1 small attitude jitter (twitchy props)
  massKg: number;           // all-up weight, affects lift and acceleration
  cells: number;            // 4 or 6
  capacityMah: number;
}
```

- `src/drone/battery.ts` (pure): `Battery` class: `charge01`, `mAhUsed`, `voltage`, `currentA`, `powerFactor`, `isEmpty`, `step(effort, dt)`, `refill()`, `estimateSecondsLeft()`. The cell curve and current formula live only here; the hangar (Phase 3) reuses `estimateSecondsLeft` for flight-time previews.
- `src/drone/flight-model.ts` takes `DroneStats` and `powerFactor` each step and reports `effort` (see flight-model).
- `src/game/modes/*`: decide what happens on empty (end run or respawn) and handle the pad swap.
- `src/ui/battery-gauge.ts`: DOM gauge.

## Edge cases

- Battery empties mid-gate: the gate still counts if crossed while falling.
- Empty over the lake: falls in, "Splashed into the lake"; run ends / respawn as above.
- Very low frame rate: drain uses `dt`, so it is frame-rate independent.
- Free flight with drain Off: gauge shows 100% and "∞" time left.

## Acceptance criteria

- [ ] Hovering drains about 8 A; flying flat out drains at least 4× faster.
- [ ] Racing pace gives 3–4 laps per battery in time trial.
- [ ] Below 20% the warning shows and top speed and climb rate drop as specified.
- [ ] At 0% the motors cut and the drone falls; time trial ends, free flight respawns with a full battery.
- [ ] Landing on the pad for 2 s refills in free flight.
- [ ] Voltage and mAh on the OSD match the battery model.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `Battery.step(0, 60)` from full | About 0.13 Ah used (8 A × 1 min), charge ≈ 91% | Unit |
| 2 | `Battery.step(1, 60)` from full | About 0.83 Ah used, charge ≈ 44% | Unit |
| 3 | Charge 10% | `powerFactor` = 0.8 | Unit |
| 4 | Charge 0% | `isEmpty` true, `powerFactor` 0 | Unit |
| 5 | Time trial at full pace until empty | 3–4 laps, then "Battery empty" result | Manual |
| 6 | Free flight: drain the battery, land on the pad and wait 2 s | "Fresh battery", 100% | Manual |
| 7 | Settings → battery drain Off, free flight | Gauge stays at 100% | Manual |

## Out of scope

Different batteries, props and upgrades (drone-parts-and-upgrades, Phase 3). Battery Challenge mode (Phase 3). Battery temperature and ageing.

## Changelog

- 2026-11-01: Created (product owner's battery idea; Phase 1 part).
