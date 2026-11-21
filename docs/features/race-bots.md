# Feature: Race Bots

Status: In progress (built, needs playtest)
Phase: 9
Branch: `feat/race-bots`
Last updated: 2026-11-21

## Summary

AI pilots for races. The host of a live room adds 1 to 5 bots and picks a skill (Easy, Medium, Hard); bots fill the grid, race the gates and appear in standings and results like any pilot. A new solo mode, **Race the bots**, runs the same thing for one player with no server. Crown chase bots come later (they need to chase and avoid obstacles).

## Player experience

- **Live room (race mode):** the lobby has a Bots row: a count (0 to 5, limited by free grid slots) and a skill. Bots show in the pilot list with a robot tag and a colour like any pilot. They are always ready. Starting still needs two humans.
- **Solo:** Main menu, "Race the bots". The lobby screen opens with you and the bots, pick laps, bots, skill and the map as usual, then Start. No room code, no invite, no server.
- **In the race:** bot drones start on the grid in their slots, fly the racing line, slow for bends, wobble a little so they do not move in lockstep, and finish. They have name tags and minimap dots, their motors are heard (positional sound), and they are listed in the standings. They do not crash into anything (they pass through drones, like humans do).
- **Results:** bots are ranked with everyone else.
- A human joining a full room pushes out the last bot instead of being refused.
- Bots only exist in race mode. Switching the room to Crown chase hides them (the setting is remembered for when it goes back).

## Skill levels (all in `config.ts` `BOTS`)

| Skill | Top speed | Notes |
|---|---|---|
| Easy | 14 m/s | A relaxed casual pilot |
| Medium | 19 m/s | Beatable without perfect lines |
| Hard | 24 m/s | Near the menu racers' pace; takes a clean lap to beat |

Corner speed is limited by the same sideways-acceleration cap the menu racers use. These are first guesses and need playtesting.

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
- [ ] Crown chase hides bots; switching back to race brings them back.
- [ ] Solo "Race the bots" runs a full race with no network.
- [ ] No console errors.

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
| 9 | Bot sim: skill ordering and determinism | Hard laps faster than Medium faster than Easy; the same inputs give the same lap | Unit |
| 10 | Solo: local room flow | Joins, adds bots, starts, finishes | Unit |
| 11 | Manual: lobby bots row, a race with bots, solo mode | See acceptance criteria | Manual |

## Verification and known gaps

- Verified: 574 tests (room logic with bots, protocol, the bot simulation, the fleet, the in-page solo room). Headless browser, solo: the menu item opens a lobby with you and three bots, the bots row works, a 1-lap Hard race started, the bots appeared on the grid with name tags and in the standings, finished in 46 to 50 s, and the results listed them with you as DNF. Headless browser, live room on the local worker with two humans: the host's bots row reached both lobbies (the guest's buttons are disabled), bots drew in both browsers at nearly the same place, and both standings agreed.
- Found and fixed on the way: the in-page room delivered a nested answer before the message that caused it (the lobby showed no bots); steps are queued now and a test locks the order.
- Lap times on the Valley (1086 m): Easy 79 s, Medium 59 s, Hard 47 s. Whether those feel right against a human is not verified: please race them and tell me.
- Not verified: other maps, 5 bots with 3 humans on a real network, the host leaving mid-race (the design says the next host takes over; unit tests cover the server side only).

## Out of scope

- Crown chase bots (next), bots that avoid or block human drones, bot names chosen by the host, bots that learn.

## Changelog

- 2026-11-21: Created.
- 2026-11-21: Built: bot simulation (`drone/bot-racer.ts`, reusing `TrackRacer`), fleet and host reporting (`game/bot-fleet.ts`), server support (`bots` and `botProgress` messages, bot pilots, ranking by reported finish time), lobby bots row, in-page solo room (`net/local-room.ts`) and the "Race the bots" menu item.
