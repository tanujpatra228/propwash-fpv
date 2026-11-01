# Feature: Motor Sound

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M7)
Last updated: 2026-11-01

## Summary

A synthesized motor whine that rises with throttle, plus wind noise that grows with speed. Gives the drone weight and makes flying feel real.

## Player experience

Press M (or the "Motor sound" button) and you hear the buzz of four motors. Climb or speed up and the pitch rises; fly fast and wind rushes past. In menus it's silent.

## Behavior and rules

Values in `config.ts` → `AUDIO`.

| Part | Value |
|---|---|
| Motor tone | Sawtooth + square at 1.502× (a slightly harsh fifth), through a low-pass filter (Q 3) |
| Motor pitch | 120 Hz + 360 Hz × throttle |
| Filter cutoff | 700 Hz + 2,600 Hz × throttle |
| Motor volume | 0.035 + 0.05 × throttle |
| Wind | Looping white noise through a band-pass at 700 Hz, volume min(0.12, speed / 30 × 0.1) |
| Smoothing | Parameter changes ramp over 40–100 ms |
| Default | Off. Browsers only allow audio after a user action, so the first press of M creates the audio |

- Muted outside flight, and fades out over 0.3 s when the battery empties and the motors cut (wind noise continues while falling).
- The on/off choice is saved (`pw.sound.v1`) and re-enabled on the first click in a later session.

## Technical design

- `src/core/audio.ts`: `MotorSound` class: `enable()`, `toggle()`, `update(throttle01, speedMps, active)`. All Web Audio nodes are created once, on first enable.
- No audio files in Phase 1 (nothing to download).

## Edge cases

- Web Audio unavailable or blocked: the button shows "Motor sound: unavailable"; the game continues.
- Tab hidden: browser suspends audio; resumes on return.

## Acceptance criteria

- [ ] M toggles sound in flight; the button label shows on/off.
- [ ] Pitch rises with throttle; wind rises with speed.
- [ ] Silent in menus.
- [ ] No errors where audio is blocked.

## Implementation notes (M7)

- `core/audio.ts`: `motorTone` (pure, tested) and `MotorSound` (Web Audio, nodes created once on first enable). Off by default; a saved "on" turns on at the first click of a later session. Wind noise is deterministic (no `Math.random`).
- The flight menu has a "Motor sound" button next to the M key. If Web Audio is blocked it reads "unavailable" and the game carries on.
- Not verified: how it actually sounds. Headless browsers have no audio output, so the tone values come straight from the preview; please listen and tell me what to change.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | In flight press M, hover, then climb | Buzz; pitch rises on climb | Manual |
| 2 | Fly at top speed | Wind noise audible | Manual |
| 3 | Press P to return to menu | Silence | Manual |
| 4 | Press M again | Sound off; label updates | Manual |

## Out of scope

Recorded motor samples, collision sounds, music, 3D positional sound for other drones (Phase 2+).

## Changelog

- 2026-11-01: Created.
