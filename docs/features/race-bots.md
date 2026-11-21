# Feature: Race Bots

Status: In progress (built, needs playtest)
Phase: 9
Branch: `feat/race-bots`
Last updated: 2026-11-21

## Summary

AI pilots for races and for crown chase. The host of a live room adds 1 to 5 bots and picks a skill (Easy, Medium, Hard, Pro); bots fill the grid and appear in standings and results like any pilot. In a race they fly the gates; in crown chase they go for the free crown, chase the king, and run when they wear it. A solo mode, **Play the bots** (menu), runs the same thing for one player with no server.

## Player experience

- **Live room (race mode):** the lobby has a Bots row: a count (0 to 5, limited by free grid slots) and a skill. Bots show in the pilot list with a robot tag and a colour like any pilot. They are always ready. Starting still needs two humans.
- **Solo:** Main menu, "Play the bots" (it was "Race the bots" until crown chase bots arrived). The lobby opens with you and three bots: pick race or crown chase, laps, bots and skill (the map is the one chosen in Maps), then Start. No room code, no invite, no server.
- **In the race:** bot drones start on the grid in their slots, fly the racing line, slow for bends, wobble a little so they do not move in lockstep, and finish. They have name tags and minimap dots, their motors are heard (positional sound), and they are listed in the standings. They do not crash into anything (they pass through drones, like humans do).
- **Results:** bots are ranked with everyone else.
- A human joining a full room pushes out the last bot instead of being refused.
- Bots stay when the room switches between race and crown chase.

## Skill levels (all in `config.ts` `BOTS`)

| Skill | Top speed | Cornering | Valley lap (measured) | Notes |
|---|---|---|---|---|
| Easy | 15 m/s | 12 m/s2 | about 74 s | A relaxed casual pilot |
| Medium | 21 m/s | 16 m/s2 | about 53 s | Beatable without perfect lines |
| Hard | 26 m/s | 21 m/s2 | about 43 s | Quick and clean: a good lap to beat |
| Pro | 28 m/s | 26 m/s2 | about 39 s | At the limits of the drone (its top speed is 28 m/s): a near-perfect lap to beat |

Cornering is the sideways acceleration the AI accepts, so skill changes how hard the bots take bends, not only how fast they are on straights. The times include the standing start. Measured on all four tracks: the Harbor is about the same as the Valley, the City about 27% longer and the Glacier about 41% longer.

### Solo bots tune themselves to you

After a solo race the bots adapt to the skill you chose: **5% faster when you beat them all, 4% slower when a bot won** (speed, with cornering following by the square), within 75% to 125%. A notice says what changed and the lobby shows it ("They tune to you: +10%"). So the race stays close as you improve, and a Pro bot at +25% is faster than the drone is meant to fly. The value is saved per skill on this device. In live rooms every browser must draw the same bots, so there the skill is used as listed.

## Crown chase bots

- **Where they run:** on the server, inside the crown engine's own loop. A bot step happens whenever a human pose arrives (about 10 times a second per human), so it costs **no extra requests, no alarms and no incoming messages**. Measured: 0.03 ms per step with 5 bots, far under any CPU limit.
- **What they fly:** the map's racing line, a closed corridor that already clears terrain and buildings. The server cannot load the world, so each map's line is stored as a small table (`core/track-lines.ts`, about 11 KB, 8 m spacing) and a test fails if the real track ever changes. A bot only steps off the line for the last few metres, straight at the king or the crown, then drifts back. The crown point of every map is on the line.
- **Behaviour (all in `core/crown-bots.ts`):**
  - Crown free or respawning: go to the crown point and wait there; go for it as soon as it can be taken.
  - Someone else wears it: go to the closest point on the line to the king, aiming ahead of the king by the skill's lead time, and leave the line to touch him once inside the skill's approach range.
  - Wearing it: run along the line the way that keeps the most distance from the nearest other pilot a few seconds ahead. The hold still ends after 30 s, as for anyone.
  - Speed and cornering come from the skill; slower bends, braking to stop at a target, acceleration limits, and a reaction delay (0.9 s Easy down to 0.12 s Pro) make the weaker bots beatable.
- **Fairness:** bots go through the same crown engine as humans (touch distance along the flown path, protection, 30 s hold, the respawn delay), so they claim and steal by the same rules.
- **Poses:** the server sends bot poses to everyone at most every 100 ms with the normal `pose` message, so clients draw them with the same smoothing, name tags, minimap dots and positional sound as human pilots. Outgoing messages are free on the free plan. Bots do not collide with anything (drones never collide in crown chase), and a bot can fly through scenery in its last few metres to a target (they are not simulated against the world).
- **Hibernation:** the bots' state is part of the room snapshot.

## How it works (free-plan friendly)

- **Bots are a pure function of time.** Each client runs the same fixed-step simulation (1/60 s) from the moment of GO, using the existing `TrackRacer`, so every browser draws the same bots with **no network traffic for bot movement**.
- **The host reports progress.** The host's client tells the server how many gates each bot has passed and when (race time in ms) at most twice a second, plus at once when a bot finishes. That is about +2 messages per second for the host (poses are 10 per second), so it stays well inside the 20:1 incoming-message budget. If the host leaves, the new host takes over reporting: the simulation is the same on every client, so nothing is lost.
- **The server treats bots as pilots** (`isBot`, always connected and ready). It ranks by the reported finish time, so a bot and a human finishing close together are ordered by the real race time, not by message arrival.
- **Solo uses the same server code in the browser:** the room logic is pure, so a local room (`net/local-room.ts`) runs it in the page and speaks the same messages. No new race rules, no Cloudflare use at all.

## Server design and free-plan budget

- New client messages: `bots` (host, lobby: count and skill) and `botProgress` (host, race: rows of id, gates, race ms, distance to next gate). New server data: `RosterEntry.isBot`, `room.bots`.
- Room state grows by a few bots (small). Bot progress is applied in memory; the room message already goes to everyone and is the only persisted change, as before.
- Extra requests: roughly 2 per second from the host during a race. A 5-minute race adds about 600 incoming messages, which is about 30 Durable Object requests at the 20:1 ratio.

## Edge cases

- Bots count toward the 8-pilot limit. A room with 3 humans can have at most 5 bots.
- A host who is the only human left: the match ends as before when fewer than two humans remain (online). In solo the human alone is enough.
- A bot that never finishes (host gone before the race ends) is covered by the existing grace period and hard stop.
- Bots in a Battery race do not drain; they race at their skill speed.

## Acceptance criteria

- [ ] The host can add and remove bots and change their skill in the lobby; everyone sees them in the pilot list with a bot tag.
- [ ] Bots appear on the grid, race the track, show in standings and finish in the results.
- [ ] A human and a bot finishing close together are ranked by real finishing time.
- [ ] A human joining a full room replaces a bot instead of being refused.
- [ ] In crown chase the bots go for the free crown, chase the king and run when they wear it, and play by the same rules as humans.
- [ ] Bots stay when switching between race and crown chase.
- [ ] Solo "Play the bots" runs a full race or crown chase with no network.
- [ ] No console errors.

## Why Hard was not enough (2026-11-21 playtest)

The first version had Hard at 47 s on the Valley, easy for a strong pilot, and bots that stay the same become dull as a player improves. Hence the Pro skill (about 39 s, the limit), cornering that scales with skill, faster acceleration for the quicker skills, and the solo adaptation above.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Room: host sets bots | Bot pilots join the roster with isBot, ready, free slots; count limited by free slots | Unit |
| 2 | Room: non-host sets bots, or in the race | Ignored | Unit |
| 3 | Room: human joins a full room with bots | A bot is removed, the human joins | Unit |
| 4 | Room: bot progress from the host | Gates advance in order, finish at laps x gates + 1, finish time from the report | Unit |
| 5 | Room: bot progress from a non-host | Ignored | Unit |
| 6 | Room: bot and human finish close together | Results ordered by finish time | Unit |
| 7 | Room: mode crown | Bots hidden; back to race restores them | Unit |
| 8 | Room: all humans leave | Room resets (bots do not keep it alive) | Unit |
| 9 | Bot sim: skill ordering, pace and determinism | Pro < Hard < Medium < Easy with real gaps; pro stays above the online minimum lap; pace above 1 is faster; the same inputs give the same lap | Unit |
| 9b | Bot pace: wins and losses | Faster after a win, slower after a loss, clamped to 75% to 125%, saved per skill | Unit |
| 10 | Solo: local room flow | Joins, adds bots, starts, finishes | Unit |
| 10 | Room: crown chase with bots | Bots on the scoreboard, poses sent throttled, a bot claims a free crown, a human on the crown takes it first, results list bots, survives hibernation, no bots without a bot setting | Unit |
| 10b | Crown bots: behaviour | Reach the crown (pro faster than easy), wait while it respawns, chase and reach a king, run as king, stay near the line, no teleport after a stall, deterministic, snapshot round trip | Unit |
| 10c | Track lines | The saved line of every map is the real racing line; every crown point is on it | Unit |
| 11 | Manual: lobby bots row, a race with bots, solo mode, crown chase against bots | See acceptance criteria | Manual |

## Verification and known gaps

- Verified: 574 tests (room logic with bots, protocol, the bot simulation, the fleet, the in-page solo room). Headless browser, solo: the menu item opens a lobby with you and three bots, the bots row works, a 1-lap Hard race started, the bots appeared on the grid with name tags and in the standings, finished in 46 to 50 s, and the results listed them with you as DNF. Headless browser, live room on the local worker with two humans: the host's bots row reached both lobbies (the guest's buttons are disabled), bots drew in both browsers at nearly the same place, and both standings agreed.
- Found and fixed on the way: the in-page room delivered a nested answer before the message that caused it (the lobby showed no bots); steps are queued now and a test locks the order.
- Lap times on the Valley (1086 m): Easy 79 s, Medium 59 s, Hard 47 s. Whether those feel right against a human is not verified: please race them and tell me.
- Not verified: other maps, 5 bots with 3 humans on a real network, the host leaving mid-race (the design says the next host takes over; unit tests cover the server side only).

## Out of scope

- Bots that avoid or block human drones, bots that fly the world's colliders (they use the racing line), bot names chosen by the host, bots that learn.

## Changelog

- 2026-11-21: Created.
- 2026-11-21: Built: bot simulation (`drone/bot-racer.ts`, reusing `TrackRacer`), fleet and host reporting (`game/bot-fleet.ts`), server support (`bots` and `botProgress` messages, bot pilots, ranking by reported finish time), lobby bots row, in-page solo room (`net/local-room.ts`) and the "Race the bots" menu item.
- 2026-11-21: Playtest feedback ("easy even in Hard, dull as players improve"): added the Pro skill, skill-based cornering and acceleration, retuned Easy, Medium and Hard (valley laps 74, 53, 43, 39 s), and solo bots that tune themselves to you after each race.
- 2026-11-21: Crown chase bots: server-side, on the racing line (`core/crown-bots.ts`, `core/track-lines.ts`), same crown rules as humans, poses broadcast throttled. Verified in a headless browser: solo crown chase against three Pro bots (they took the crown from each other and the standings showed the crown and points, no errors) and a live room on the local worker with two humans (both browsers showed the same bot wearing the crown). The menu item became "Play the bots".
