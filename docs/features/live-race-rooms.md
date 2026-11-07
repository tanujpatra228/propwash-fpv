# Feature: Live Race Rooms

Status: In progress
Phase: 5
Branch: `feat/phase-5`
Last updated: 2026-11-07

## Summary

Up to 8 friends race the Valley Sprint together, live. One person creates a room and shares a link; friends join, mark ready, and the host starts a 3-2-1 countdown. Everyone sees the others' drones moving in real time, a live position tracker, and a results screen with a rematch button. Free plan only: one Cloudflare Durable Object per room, WebSockets with hibernation.

## Player experience

1. Main menu → **Race friends**. Choose a pilot name if you have none (same rules as the leaderboard).
2. **Create a room**, or type a room code. You land in the **lobby**: a 5-letter code, a **Copy invite link** button, the list of pilots (name, ready tick, ping), a chat box, and the lap count (host chooses 1 to 5, default 3).
3. A friend opens the link (`/?room=ABCDE`), goes straight to the same lobby, and presses **Ready**.
4. The host presses **Start race** (needs at least 2 pilots, everyone ready). A 3, 2, 1, GO countdown runs on the server's clock so everyone starts together.
5. Race: fly the track for the chosen laps. Other pilots appear as drones with name tags and keep moving smoothly. A panel shows your position (`2nd / 4`), lap, and a live standings list. Drones do not collide with each other.
6. When someone finishes, a **finish banner** shows their place. When everyone has finished (or 60 s after the first finisher), the **results** appear: place, name, total time, best lap. **Rematch** returns everyone to the lobby; **Leave** goes to the menu.

## Behavior and rules

- **Room:** 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L look-alikes). Max **8 pilots**. The creator is the **host**; if the host leaves, the longest-present pilot becomes host.
- **Phases:** `lobby` → `countdown` (3 s) → `racing` → `results` → back to `lobby` on rematch.
- **Start rules:** host only; 2 to 8 pilots connected; every non-host pilot ready. Joining during `countdown` or `racing` is refused ("Race in progress").
- **Same valley:** a room has a `worldVersion`; a client on a different version is refused with a clear message.
- **Starting grid:** 8 slots in two rows behind the start gate, slot = join order. Drones hover during the countdown; input is locked until GO (as in time trial).
- **Laps and gates:** each pilot's game runs its own physics and `LapTracker` and reports each gate crossing. The server checks gates arrive **in order** and not faster than 1 s apart, and decides the **finish order by the server's clock** when it receives the last gate of the last lap. Pilots cannot claim a finish they did not reach in order.
- **Crashes** respawn at the last gate as usual; the race clock keeps running.
- **Disconnects:** during a race a dropped pilot's drone fades out after 5 s and they count as DNF (did not finish). In the lobby they just leave the list. A pilot who refreshes can rejoin the lobby, not a running race.
- **Chat:** plain text, up to 120 characters, one message per second per pilot, control and invisible characters removed. Shown with `textContent`, never HTML.
- **Positions in the race panel:** ranked by laps completed, then gates passed in the lap, then (as a tie-break) distance to the next gate, reported with each pose update.
- **Not in scope:** drone collisions, spectators, voice chat, ranked ratings, public room lists. Spec versus Open classes (Phase 3) are skipped for now: everyone flies the stock drone.

## Protocol (WebSocket, JSON text frames)

Connect to `GET /api/rooms/:code/ws?name=<name>&world=<worldVersion>` (upgrade). The pilot's saved leaderboard id is never sent: inside a room each connection gets a random short id. `POST /api/rooms` returns `{ code }` for a fresh unused code.

| From | Message | Purpose |
|---|---|---|
| client | `{ t: 'ready', isReady }` | Toggle ready (lobby) |
| client | `{ t: 'laps', laps }` | Host sets the lap count (lobby) |
| client | `{ t: 'start' }` | Host starts the race (lobby) |
| client | `{ t: 'chat', text }` | Chat message |
| client | `{ t: 'pose', x, y, z, yaw, pitch, roll, dNextM }` | Position at 10 Hz during countdown and race. Positions in cm, angles in 0.01 rad (integers); `dNextM` is the distance to the next gate, a tie-break for standings. |
| client | `{ t: 'gate', index }` | The drone passed this gate (in order) |
| client | `{ t: 'rematch' }` | Host returns everyone to the lobby from results |
| server | `{ t: 'welcome', you, code }` | Your id in this room |
| server | `{ t: 'room', phase, hostId, laps, pilots }` | Roster and phase, sent on every change |
| server | `{ t: 'chat', from, text }` | Chat relay |
| server | `{ t: 'countdown', startsInMs }` | Race is starting; clients start their own 3 s countdown from this |
| server | `{ t: 'pose', id, ... }` | One pilot's pose, relayed at once to everyone else (outgoing messages are free, so there is no batching timer or alarm) |
| server | `{ t: 'standings', order }` | Pilot ids in race order, sent on every verified gate |
| server | `{ t: 'go' }` | The countdown ended |
| server | `{ t: 'finish', id, place, timeS }` | Someone finished |
| server | `{ t: 'results', rows }` | Final order and times |
| server | `{ t: 'error', message }` | Human-readable refusal |
| both | `ping` / `pong` (plain text) | Latency; answered by the runtime's auto-response, so a ping never wakes the room |

Frames over 512 bytes, unknown types, wrong shapes and too-frequent messages are dropped; a connection that keeps sending bad frames is closed.

## Free-plan budget (checked against Cloudflare's published free limits on 2026-11-07)

Free plan: Durable Objects 100,000 requests/day and 13,000 GB-seconds/day (SQLite-backed only). Incoming WebSocket messages count 20:1 as requests; outgoing messages are free. Idle connections on the Hibernation API are not billed for duration.

Cost of one race (8 pilots, 4 minutes = 240 s), the worst case:

| Item | Maths | Per race |
|---|---|---|
| Pose messages in | 8 pilots x 10/s x 240 s = 19,200 messages / 20 | **960 requests** |
| Gate, chat, ready, start | a few hundred messages / 20 | about 20 requests |
| Connections (upgrade requests) | 8 Worker requests + 8 Durable Object requests | 16 requests |
| Duration | 128 MB (0.125 GB) x about 300 s active | about 38 GB-s |
| Outgoing pose broadcasts | 8 x 10/s x 240 s = 19,200 | free |

| Daily limit | Races it allows | Notes |
|---|---|---|
| 100,000 requests | about **100 full 8-player races a day**, or about 200 four-player races | The binding limit |
| 13,000 GB-s | about 340 races | Not the limit |

For friends this is plenty. Safeguards that keep it from running out:
- Poses are sent **only during the race**, at 10 Hz, never in the lobby; there is no per-frame traffic outside a race.
- Pings use the runtime auto-response and never wake the room.
- A room with nobody connected hibernates and costs nothing; an unused room is deleted from storage after 1 hour.
- Hard caps: 8 pilots per room, 512-byte frames, 20 messages per second per connection, race hard-stop after 15 minutes.
- If a daily limit were ever hit, new connections fail; the client shows "Live racing is busy, try again later" and every other mode keeps working.
- If the budget needs stretching later: lower the pose rate to 7 to 8 Hz or interpolate with a longer buffer (see Technical design).

## Technical design

- `src/core/room-protocol.ts` (pure, shared by game and server): message types, `parseClientMessage` (validates shape, ranges and size), `roomCode` helpers, constants.
- `src/core/room-logic.ts` (pure): the room state machine (join, leave, ready, laps, start, countdown, gate order and speed checks, finish order, results, rematch, host hand-over). Takes messages plus a clock and returns state and outgoing messages. No sockets, so it is tested exhaustively.
- `worker/src/race-room.ts`: the Durable Object, a thin wrapper around `room-logic` using the Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`, `setWebSocketAutoResponse` for ping), with room state in the object's SQLite storage so it survives hibernation.
- `worker/src/index.ts`: routes `/api/rooms` and `/api/rooms/:code/ws` to the object.
- `wrangler.jsonc`: Durable Object binding `ROOMS` and a migration (`new_sqlite_classes: ["RaceRoom"]`, the only kind allowed on the free plan).
- `src/net/room-client.ts`: browser WebSocket wrapper with typed messages, ping timing, reconnect to the lobby only.
- `src/net/snapshot-buffer.ts` (pure): stores recent poses per remote pilot and returns the interpolated pose at `now - 100 ms`; extrapolates briefly (max 250 ms) when messages are late.
- `src/game/modes/live-race.ts`: the mode: grid start, countdown from the server, reports poses and gates, standings.
- `src/game/remote-drones.ts`: drone models, name tags and smoothing for the other pilots.
- `src/ui/lobby-screen.ts`, `src/ui/race-standings.ts`, results through the existing `ChoiceDialog` or a results panel.
- Main menu: **Race friends**; `?room=CODE` handling in `main.ts`.

## Edge cases

- Two players with the same name: allowed; the room shows a small number suffix in the standings only.
- A pilot's clock drifts or tab freezes: poses stop; after 5 s the drone fades; they can still finish later (their `gate` messages still count) unless they disconnected.
- Host closes the tab in the lobby: the next pilot becomes host. In a race the race continues.
- Everyone leaves mid-race: the room resets to the lobby and hibernates.
- Two rooms with the same code: impossible in practice (random 5 characters from 32); creating one that exists reuses the existing room (join).
- Browser tab hidden: the browser slows timers, poses may be sparse; interpolation holds the last pose and the drone fades if silent for 5 s.
- WebSocket blocked by a network: the client says it cannot connect and offers solo modes.

## Acceptance criteria

- [ ] Create a room, share the link, a second browser joins the same lobby.
- [ ] Ready, lap-count and start rules are enforced; non-hosts cannot start.
- [ ] The countdown starts at the same moment for everyone (within the network delay).
- [ ] Remote drones move smoothly (no visible teleporting at 10 Hz).
- [ ] Finish order follows the server's clock; out-of-order gates are refused.
- [ ] Results show correct places; Rematch returns everyone to the lobby.
- [ ] Disconnect handling works in lobby and race; the host hands over.
- [ ] Junk (oversize frames, bad JSON, wrong types, chat flooding, invalid names) is refused without crashing the room.
- [ ] The budget above holds in a local load test (messages per second and CPU per message).

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Parse good and bad client messages (shapes, ranges, size) | Good accepted; bad rejected with a reason | Unit |
| 2 | Room logic: join up to 8, 9th refused; join during a race refused | As described | Unit |
| 3 | Start by a non-host, with one pilot, with someone not ready | Refused each time | Unit |
| 4 | Gate order: 0,1,2 accepted; 0,2 refused; two gates 0.2 s apart refused | As described | Unit |
| 5 | Finish order from server arrival times; DNF on disconnect | Correct places | Unit |
| 6 | Host leaves: next pilot becomes host; rematch returns to lobby | As described | Unit |
| 7 | Snapshot buffer interpolates, extrapolates briefly, fades when silent | Smooth, bounded | Unit |
| 8 | Local Worker + Durable Object, two WebSocket clients: lobby, ready, start, race, finish, results | Full flow works | Integration |
| 9 | Flood a connection with 200 messages per second | Excess dropped, room unharmed | Integration |
| 10 | Two browsers race on a local server | Both see each other move; finish order right | Manual |

## Out of scope

Drone collisions, spectators, voice, ratings, public room browser, Spec and Open classes (Phase 3), reconnecting into a running race.

## Changelog

- 2026-11-07: Created.
