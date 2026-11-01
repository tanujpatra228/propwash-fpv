# Feature: Controls and Key Bindings

Status: In progress
Phase: 1
Branch: `feat/phase-1` (milestone M2)
Last updated: 2026-11-01

## Summary

Simple keyboard-and-mouse controls, with a Controls panel where the player can change any key. Game code works with named actions, never raw keys.

## Player experience

WASD moves, Space and Shift go up and down, the mouse turns like a first-person game. Clicking the view locks the mouse for steering; Esc releases it. Any key can be changed in the Controls panel, and the choice is remembered next time.

## Controls

| Action id | Label | Default | Alternate | Type |
|---|---|---|---|---|
| `forward` | Fly forward | W | ↑ | Hold |
| `back` | Fly backward | S | ↓ | Hold |
| `left` | Slide left | A | ← | Hold |
| `right` | Slide right | D | → | Hold |
| `up` | Go up | Space | — | Hold |
| `down` | Go down | Left Shift | — | Hold |
| `turnLeft` | Turn left | Q | — | Hold |
| `turnRight` | Turn right | E | — | Hold |
| `camera` | Switch camera | C | — | Press |
| `reset` | Reset to last gate | R | — | Press |
| `static` | Analog static on / off | G | — | Press |
| `sound` | Motor sound on / off | M | — | Press |
| `pause` | Pause / menu | P | — | Press |

Mouse: horizontal movement turns (pointer lock). If pointer lock is refused, click-and-drag on the view acts as a joystick (drag sideways = turn, drag up/down = forward/back).

## Behavior and rules

- Each action has two slots (main, alternate). A key can belong to only one slot.
- **Rebinding:** click a slot → "Press a key…" → the next key press is saved.
  - Esc cancels. Backspace or Delete clears the slot.
  - If the key was used elsewhere, it is removed there and the panel says so ("S was used for 'Fly backward'. It now does this instead.").
  - Escape, F5, F11, F12 and Ctrl/Meta combinations can't be bound (browser keys).
- **Mouse turn speed:** slider 0.3×–3.0×, default 1.0×.
- **Reset to defaults** button.
- Saved in `localStorage` key `pw.bindings.v1` (and `pw.mouseSens.v1`). Invalid saved data falls back to defaults.
- While the Controls panel is open, game input is ignored and held keys are released.
- Keys only act during flight; in menus they do nothing.
- A focused button never swallows Space: focus returns to the game when a game key is pressed.
- Window blur releases all held keys (no stuck keys after Alt+Tab).

## UI

- Controls panel (modal): two groups, "Flying" and "Game"; columns "Key" and "Alternate"; status note line; mouse speed slider; Reset to defaults; Done.
- Opened from the main menu (Controls) and the in-flight menu (Change controls).
- In-flight help bar and button hints show the current keys (they update immediately after rebinding).

## Technical design

- `src/input/key-bindings.ts`: `ACTIONS` table (id, label, group, type, defaults), `loadBindings()`, `saveBindings()`, `rebind(bindings, actionId, slot, code)` (pure, returns the moved-from action), `actionForCode(bindings, code)`, `keyLabel(code)`.
- `src/input/input.ts`: `Input` class: listens to keyboard, mouse, pointer lock and blur; `isDown(action)`, `consumeMouseYawRad()`, `stick`, `onPress(callback)`, `enabled`.
- `src/ui/controls-panel.ts`: builds the modal from `ACTIONS` (no hard-coded rows), uses a capture-phase key listener while waiting for a key.
- Storage through `core/storage.ts`.

## Edge cases

- Storage blocked (private mode): bindings work for the session, not saved, no error.
- Saved bindings from an older version missing a new action: that action gets its default.
- Two actions left with no key: allowed; the help bar shows "–".
- Pointer lock refused or unavailable: drag steering works; hint text explains.

## Acceptance criteria

- [ ] All defaults work as listed.
- [ ] Every action can be rebound; changes apply immediately and survive reload.
- [ ] Binding a key already in use moves it and shows the note.
- [ ] Esc cancels, Backspace clears, Reset restores defaults.
- [ ] Mouse turning works with pointer lock; drag fallback works without it.
- [ ] No stuck keys after switching windows.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | `rebind(defaults, 'down', 1, 'KeyS')` | `bindings.down[1]` = KeyS, `back` main cleared, `movedFrom` = `'back'`; input bindings unchanged | Unit |
| 2 | Load corrupt JSON from storage | Defaults returned | Unit |
| 3 | Controls → set "Go up" to J, reload, fly | J climbs | Manual |
| 4 | Click the view, move the mouse | Drone turns; Esc releases the mouse | Manual |
| 5 | Hold W, Alt+Tab away and back | Drone not still flying forward | Manual |
| 6 | Click "Change controls" button, then press Space in flight | Drone climbs, button doesn't activate | Manual |

## Out of scope

Gamepad, RC transmitter, touch controls (non-goals). Invert options and acro mode bindings (Phase 2).

## Changelog

- 2026-11-01: Created. Layout approved in the preview artifact.
