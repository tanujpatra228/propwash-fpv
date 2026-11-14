# Feature: Dethrone (Crown Chase)

Status: Planned
Phase: 7
Branch: `feat/phase-7`
Last updated: 2026-11-14

## Summary

A live-room game mode that is not a race. One pilot wears the crown. Everyone else tries to dethrone them by staying close for two seconds. Every second on the crown is a point. Most points after three minutes wins. It works on every map and uses the existing rooms, lobby, name tags and minimap, so a friend can be invited with the same link.

## Player experience

- In the lobby the host picks **Race** or **Crown chase** (laps do not apply to crown chase). Everyone readies up as usual.
- 3, 2, 1, GO. Everyone starts on the starting grid. The crown goes to a random pilot at GO.
- The king wears a gold crown above their drone, a gold name tag, and a gold dot on everyone's minimap. A king sees it on their own drone in the chase camera and gets a banner.
- **Dethroning:** stay within 7 m of the king (any direction, including above or below) for 2 seconds in total. A ring on your HUD fills while you are close; the king sees "Being dethroned" and how far along it is. Drift out of range and the progress drains twice as fast as it filled.
- **Protection:** a new king cannot be dethroned for 3 seconds, so the crown cannot ping-pong.
- **Scoring:** 1 point per second on the crown. A standings panel lists points live. Three minutes, then results (rank and seconds on the crown) and a rematch.
- A crash respawns you on your starting-grid slot (no gates in this mode). The world is solid and the king can use it: lead the pack through tight gaps.

## Rules in numbers (all in `config.ts` `CROWN`)

| Rule | Value |
|---|---|
| Match length | 180 s |
| Steal range | 7 m (3D distance between drones) |
| Time within range to steal | 2 s (progress drains at 2x outside range) |
| Protection after a steal | 3 s |
| Pose older than | 1.5 s does not count (a frozen tab cannot steal or be stolen from) |
| Points | 1 per second on the crown |
| Players | 2 to 8, same as races |

If the king leaves, the crown passes to the pilot with the most points. If only one pilot is left, the match ends and they win.

## Server design (free-plan note)

- All scoring is on the server, driven by the position updates the room already receives (10 per second per pilot). There is **no extra timer**: the engine advances when a pose arrives, and a single alarm ends the match. A 3 minute match with 8 pilots costs the same request count as a race of that length (about 700 billed requests), well inside the 100,000 per day.
- New outgoing `crown` messages (holder, scores, threat, time left) are sent at most every 250 ms; outgoing messages are free.
- Positions are client-reported, so this is friendly-play fairness, not anti-cheat, as with races.

## Technical design

- `src/core/crown-game.ts` (pure): the match engine (`start`, `setPose`, `advance`, `remove`, `scores`, `threat`, snapshot). Fully unit tested.
- `src/core/room-logic.ts`: room `mode` (`race` or `crown`), the host's `mode` message, delegating to the engine, results as ranked points.
- `src/core/room-protocol.ts`: `mode` and `crown` messages, `mode` in the room message, `score` in result rows.
- `src/game/modes/live-crown.ts`: the client mode (countdown, poses, standings by points, banners, results dialog).
- `src/drone/crown.ts`: the crown model; `RemoteDrones` parents it on the king, the player's own drone shows it when they are king.
- HUD: standings rows can carry their own detail text; name tags and minimap dots take a king style; a steal ring and a threat note.
- Lobby: mode toggle for the host.

## Edge cases

- Two pilots in range at once: whoever's progress reaches 2 s first wins; everyone's progress resets.
- A pilot who joined late: joining during a match is refused, as for races.
- Everyone far apart: nobody gains progress, the king keeps scoring.
- Reconnecting mid-match is not supported (same as races).

## Acceptance criteria

- [ ] Host can switch mode; the lobby, countdown and results work for both modes.
- [ ] A chaser within 7 m for 2 s takes the crown; outside range progress drains; a new king is protected for 3 s.
- [ ] Points accrue only to the holder; results rank by points.
- [ ] King's crown, tag and minimap marker show for everyone; the king and the chaser see their own status.
- [ ] Works on every map.
- [ ] The match ends on time and when too few pilots remain.

## Test cases

| # | Steps | Expected | Type |
|---|---|---|---|
| 1 | Engine: chaser in range 2 s | Steals; scores continue for the new king | Unit |
| 2 | Engine: chaser in range 1.9 s, then away | No steal; progress drains | Unit |
| 3 | Engine: steal then immediate chase | Protected for 3 s | Unit |
| 4 | Engine: king leaves | Crown goes to the top scorer | Unit |
| 5 | Engine: stale pose | Does not count | Unit |
| 6 | Room: mode switch by non-host, during a match | Ignored | Unit |
| 7 | Room: crown match runs to the end alarm and ranks by points | Results correct | Unit |
| 8 | Two browsers in a crown room | Both see the crown, a steal works, results appear | Browser |

## Out of scope

Power-ups, hitting or pushing drones, teams, a solo version against bots (later), spectators.

## Changelog

- 2026-11-14: Created.
