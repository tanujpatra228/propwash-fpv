# Feature: Training Mode

Status: In progress
Phase: 2
Branch: `feat/phase-2`
Last updated: 2026-11-01

## Summary

Six short lessons that teach a new pilot to take off, hover, land, move, turn and fly through gates, with a checklist on screen. Flight feel is the product, and most new players have never flown a drone: this gets them flying within a couple of minutes.

## Player experience

Choose Training. The drone sits on the pad. A panel at the top left shows "Training · Lesson 1" with a short checklist ("Hold Space until you are 3 m above the ground"). Each step ticks off as you do it. When the last step is done, "Lesson complete" appears and the next lesson starts a moment later. Your progress is saved; the menu shows "Lesson 3 of 6" and Training resumes there. After lesson 6, "Training complete" appears and you keep flying freely.

## Behavior and rules

- **No battery drain** and no timer. Crashing respawns you on the pad (lessons 1 to 4) or at your last gate (lessons 5 and 6). The reset key respawns the same way.
- **Lessons** (values in `config.ts` → `TRAINING`):

| # | Title | Steps |
|---|---|---|
| 1 | Take off | Rise to 3 m |
| 2 | Hover and land | Rise to 3 m; hover for 5 s (stay above 1.5 m and under 3 m/s); land gently on the pad |
| 3 | Fly forward | Fly 40 m from the pad; come back and land on the pad |
| 4 | Turn | Turn a full circle one way; turn a full circle the other way |
| 5 | Your first gate | Fly through the start gate |
| 6 | A short course | Fly through the first four gates in order |

- **Landing on the pad** counts when you are within 1.6 m of its centre, on the ground, slower than 0.5 m/s.
- A step that is done stays done for that lesson. A lesson that is done is saved even if you leave.
- Progress key: `pw.training.v1` (`{ completed: 0..6 }`). Corrupt data starts from lesson 1.

## UI

- Lesson panel (top left): eyebrow "Training · Lesson n of 6", title, checklist with a tick for finished steps.
- Banner "Lesson complete" (2.5 s) and "Training complete".
- Main menu: a Training button with the subtitle "Lesson n of 6 · Title", or "Learn to fly in six short lessons" before you start.

## Technical design

- `src/game/modes/training-lessons.ts` (pure): lesson definitions and step checkers (reach height, hover for time, land on the pad, reach distance, turn a full circle, pass a gate); `LessonRunner` advances steps from a plain frame snapshot.
- `src/game/modes/training.ts`: `TrainingMode` (a `GameMode`), builds the frame snapshot from the host, saves progress, shows banners.
- `src/game/training-progress.ts`: load and save progress through `core/storage.ts`.
- `src/ui/lesson-panel.ts`: the checklist panel; it reads `ModeHud.lesson`.
- Tests share a fake `ModeHost` (`modes/test-host.ts`).

## Edge cases

- Leaving mid-lesson restarts that lesson from step 1 next time (progress is per finished lesson).
- Crashing during a step does not undo finished steps.
- Hover timer resets whenever you leave the allowed band.
- Yaw wraps at plus and minus pi; turns are accumulated frame to frame, so a full circle counts however the angle wraps.

## Acceptance criteria

- [ ] Training starts on the pad with the first unfinished lesson.
- [ ] Each lesson's steps tick off in order, and finishing the last step completes the lesson.
- [ ] Finishing a lesson saves progress; the menu shows the next lesson.
- [ ] Crashes respawn on the pad (lessons 1 to 4) or at the last gate (5 and 6).
- [ ] Battery never drains in training.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Runner: height 3 m for lesson 1 | Lesson done | Unit |
| 2 | Runner: hover timer broken by leaving the band | Timer restarts | Unit |
| 3 | Runner: turn one way 2 pi, then the other | Lesson 4 done | Unit |
| 4 | Training: finish lesson 1, reload | Next start is lesson 2 | Unit |
| 5 | Training: crash respawn in lesson 2 vs lesson 5 | Pad vs last gate | Unit |
| 6 | Fly lesson 1 in the browser | Panel ticks and banner appears | Manual |

## Out of scope

Voice-over, ghost instructors, lesson selection menu, scoring and stars (later).

## Changelog

- 2026-11-01: Created.
