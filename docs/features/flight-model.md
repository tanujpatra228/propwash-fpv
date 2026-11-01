# Feature: Flight Model

Status: Planned
Phase: 1
Branch: `feat/flight-model`
Last updated: 2026-11-01

## Summary

How the player's drone moves. A beginner-friendly "angle mode": real tilt-and-thrust physics for horizontal movement, altitude hold for vertical movement, automatic leaning into turns, and reduced sideways drift. Easy on keyboard and mouse, still feels like a drone.

## Player experience

- Hold **Space** to rise, **Shift** to sink. Let go and the drone holds its height.
- Hold **W** and the drone tips its nose down and speeds up; let go and it levels out and coasts to a stop.
- **A/D** tilt it sideways to slide. **Mouse** (or Q/E) turns it, and when moving it banks into the turn like a real pilot would.
- Top speed is about 100 km/h.

## Behavior and rules

All values live in `config.ts` → `FLIGHT`.

| Rule | Value |
|---|---|
| Max tilt (forward/back/side) | 0.72 rad (~41°) |
| Tilt response | 6 /s (exponential smoothing toward target tilt) |
| Horizontal thrust | `g / max(0.4, up.y)`, so tilting never loses height |
| Climb rate (Space) | 6 m/s |
| Descend rate (Shift) | 5 m/s |
| Vertical response | 3 /s (vertical speed eases to the target; 0 when no key = altitude hold) |
| Air drag | quadratic 0.0105 + linear 0.12 (horizontal), top speed ~28 m/s |
| Keyboard turn rate | 2.2 rad/s |
| Mouse turn | 0.0025 rad per pixel × mouse sensitivity (0.3–3.0, default 1.0) |
| Auto bank | 0.14 × yaw rate, max 0.45 rad, full effect from 12 m/s |
| Drift assist | Sideways velocity bleeds off at 1.2 /s when not sliding on purpose |
| Ground contact | Drone rests 0.1 m above ground; landing below 8 m/s is safe |
| Time step | `dt` clamped to [0.0001, 0.05] s |

- Orientation is built as yaw → pitch → roll (`Euler` order `YXZ`). Forward is −Z.
- Throttle shown in the HUD is derived from the vertical input and speed (display only).

## Technical design

- `src/drone/flight-model.ts`: `FlightModel` class.
  - State: `position`, `velocity`, `yawRad`, `pitchRad`, `rollRad`, `yawRateRadps`, `throttle01`, `quaternion`.
  - `step(input: FlightInput, dt: number): void`, pure motion only (no collisions, no DOM, no scene).
  - `reset(position, yawRad)`, `setFromPose(position, quaternion, velocity)`.
- `FlightInput` (from `input/`): `forward`, `back`, `left`, `right`, `up`, `down`, `turnLeft`, `turnRight` (0 or 1), `mouseYawRad`, `stickX`, `stickY` (−1..1 drag fallback).
- Collisions and ground response are applied after `step` by `physics/` (see collisions-and-crash).
- Scratch vectors are module-level; `step` allocates nothing.

## Edge cases

- `dt` of 0 (two frames in the same millisecond): clamped, no NaN.
- Tab hidden then shown: large `dt` clamped to 0.05 s, no jump through terrain.
- Up and Down held together: cancel out (hold height).
- Opposite directions held (W+S): cancel out.

## Acceptance criteria

- [ ] From rest on the pad, holding Space for 2 s reaches 9–11 m; releasing holds height within ±0.5 m over 5 s.
- [ ] Holding W for 3 s from a hover reaches 55–70 km/h; top speed 95–110 km/h.
- [ ] Releasing all keys at speed slows the drone smoothly without bouncing.
- [ ] Turning with the mouse while moving makes the drone bank into the turn and follow the nose.
- [ ] No NaN or Infinity in state under any `dt`.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Step 60 frames at 1/30 s with `up=1` from rest | Height 9–11 m | Unit |
| 2 | Then 150 frames with no input | Height changes < 0.5 m | Unit |
| 3 | 90 frames with `forward=1` | Speed 15–19.5 m/s | Unit |
| 4 | `step` with `dt = 0` | State stays finite | Unit |
| 5 | Fly a lap with keyboard and mouse | Turns feel smooth, no sideways sliding when turning | Manual |

## Out of scope

Acro mode (no self-levelling), battery sag affecting thrust, wind, prop wash (later phases).

## Changelog

- 2026-11-01: Created. Values tuned in the preview artifact.
