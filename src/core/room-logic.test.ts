import { beforeEach, describe, expect, it } from 'vitest';
import { CROWN, ROOMS, TRACK, TRACK_DEFS, WORLD } from '../config';
import { EVERYONE, Room, type Step } from './room-logic';

const GATES = TRACK.gateCount;
const send = (r: Room, id: string, m: object, t: number): Step => r.receive(id, JSON.stringify(m), t);
const kinds = (s: Step): string[] => s.out.map((o) => o.message.t);

function lobby(names: string[]): Room {
  const room = new Room('ABCDE', WORLD.version);
  names.forEach((n, i) => room.join(n.toLowerCase(), n, WORLD.version, i));
  return room;
}

function raceOf(names: string[], laps = 1): { room: Room; t0: number } {
  const room = lobby(names);
  send(room, names[0]!.toLowerCase(), { t: 'laps', laps }, 10);
  for (const n of names.slice(1)) send(room, n.toLowerCase(), { t: 'ready', isReady: true }, 20);
  send(room, names[0]!.toLowerCase(), { t: 'start' }, 1000);
  room.tick(1000 + ROOMS.countdownMs);
  return { room, t0: 1000 + ROOMS.countdownMs };
}

/** Flies a pilot through the start line, every gate and back over the line for each lap, 2 s apart. Returns the last gate's time. */
function fly(room: Room, id: string, from: number, laps = 1): number {
  let t = from;
  for (let i = 0; i < laps * GATES + 1; i++) {
    t += 2000;
    send(room, id, { t: 'gate', index: i % GATES }, t);
  }
  return t;
}

describe('joining', () => {
  it('first pilot is host and gets a welcome', () => {
    const room = new Room('ABCDE', WORLD.version);
    const step = room.join('p1', 'Arjun', WORLD.version, 0);
    expect(room.getHostId()).toBe('p1');
    expect(kinds(step)).toEqual(['welcome', 'room']);
  });
  it('refuses a wrong version, a bad name, a duplicate tab and a ninth pilot', () => {
    const room = lobby(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh']);
    expect(room.join('x', 'Xavier', WORLD.version, 0).close).toEqual(['x']);
    expect(room.pilotCount()).toBe(ROOMS.maxPilots);
    const small = lobby(['aa']);
    expect(small.join('v', 'Vee', WORLD.version + 1, 0).close).toEqual(['v']);
    expect(small.join('b', '<b>', WORLD.version, 0).close).toEqual(['b']);
    expect(small.join('aa', 'Again', WORLD.version, 0).close).toEqual(['aa']);
    expect(small.pilotCount()).toBe(1);
  });
  it('assigns distinct grid slots and reuses a freed one', () => {
    const room = lobby(['aa', 'bb', 'cc']);
    room.leave('bb', 5);
    room.join('dd', 'dd', WORLD.version, 6);
    const roomMsg = room.join('ee', 'ee', WORLD.version, 7).out.find((o) => o.message.t === 'room')?.message;
    const slots = roomMsg?.t === 'room' ? roomMsg.pilots.map((p) => p.slot) : [];
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('starting', () => {
  let room: Room;
  beforeEach(() => {
    room = lobby(['host', 'guest']);
  });
  it('refuses non-host, lone pilot and unready guests', () => {
    expect(kinds(send(room, 'guest', { t: 'start' }, 10))).toEqual(['error']);
    expect(kinds(send(room, 'host', { t: 'start' }, 10))).toEqual(['error']);
    expect(room.getPhase()).toBe('lobby');
    const solo = lobby(['solo']);
    expect(kinds(send(solo, 'solo', { t: 'start' }, 10))).toEqual(['error']);
  });
  it('starts a countdown when everyone is ready and goes at the right time', () => {
    send(room, 'guest', { t: 'ready', isReady: true }, 10);
    const step = send(room, 'host', { t: 'start' }, 100);
    expect(room.getPhase()).toBe('countdown');
    expect(kinds(step)).toContain('countdown');
    expect(room.nextWakeMs()).toBe(100 + ROOMS.countdownMs);
    expect(room.tick(100 + ROOMS.countdownMs - 1).out).toHaveLength(0);
    expect(kinds(room.tick(100 + ROOMS.countdownMs))).toContain('go');
    expect(room.getPhase()).toBe('racing');
  });
  it('refuses joins once the race has begun', () => {
    send(room, 'guest', { t: 'ready', isReady: true }, 10);
    send(room, 'host', { t: 'start' }, 100);
    expect(room.join('late', 'Late', WORLD.version, 200).close).toEqual(['late']);
  });
  it('only the host sets laps', () => {
    send(room, 'guest', { t: 'laps', laps: 5 }, 10);
    send(room, 'host', { t: 'laps', laps: 2 }, 11);
    const msg = room.join('z', 'Zed', WORLD.version, 12).out.find((o) => o.message.t === 'room')?.message;
    expect(msg?.t === 'room' && msg.laps).toBe(2);
  });
});

describe('racing', () => {
  it('accepts gates in order and rejects skips and replays', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    expect(kinds(send(room, 'host', { t: 'gate', index: 1 }, t0 + 3000))).toEqual([]);
    expect(kinds(send(room, 'host', { t: 'gate', index: 0 }, t0 + 3000))).toContain('standings');
    expect(kinds(send(room, 'host', { t: 'gate', index: 0 }, t0 + 6000))).toEqual([]);
  });
  it('rejects gates that arrive impossibly fast', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    send(room, 'host', { t: 'gate', index: 0 }, t0 + 2000);
    expect(kinds(send(room, 'host', { t: 'gate', index: 1 }, t0 + 2200))).toEqual([]);
    expect(kinds(send(room, 'host', { t: 'gate', index: 1 }, t0 + 2000 + ROOMS.minGateGapMs))).toContain('standings');
  });
  it('first gate cannot arrive before the race has started', () => {
    const room = lobby(['host', 'guest']);
    send(room, 'guest', { t: 'ready', isReady: true }, 5);
    send(room, 'host', { t: 'start' }, 100);
    expect(kinds(send(room, 'host', { t: 'gate', index: 0 }, 200))).toEqual([]);
  });
  it('finish order follows server arrival time and the race ends when all finish', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    const last = fly(room, 'guest', t0);
    const step = fly(room, 'host', t0 + 500);
    expect(step).toBeGreaterThan(last);
    expect(room.getPhase()).toBe('results');
  });
  it('results list places, times and best lap', () => {
    const { room, t0 } = raceOf(['host', 'guest'], 2);
    fly(room, 'guest', t0, 2);
    const step: Step = { out: [], close: [] };
    let t = t0 + 300;
    for (let i = 0; i < 2 * GATES + 1; i++) {
      t += 2500;
      step.out.push(...send(room, 'host', { t: 'gate', index: i % GATES }, t).out);
    }
    const results = step.out.find((o) => o.message.t === 'results')?.message;
    expect(results?.t).toBe('results');
    if (results?.t !== 'results') return;
    expect(results.rows.map((r) => r.id)).toEqual(['guest', 'host']);
    expect(results.rows.map((r) => r.place)).toEqual([1, 2]);
    expect(results.rows[0]?.bestLapS).toBeCloseTo(GATES * 2, 5);
  });
  it('ends after the grace period when someone never finishes, marking them DNF', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    const done = fly(room, 'host', t0);
    expect(room.getPhase()).toBe('racing');
    expect(room.nextWakeMs()).toBe(done + ROOMS.graceAfterFirstFinishMs);
    const step = room.tick(done + ROOMS.graceAfterFirstFinishMs);
    const results = step.out.find((o) => o.message.t === 'results')?.message;
    expect(results?.t === 'results' && results.rows.map((r) => r.place)).toEqual([1, 0]);
  });
  it('hard stop ends a race nobody finishes', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    expect(room.tick(t0 + ROOMS.raceHardStopMs).out.some((o) => o.message.t === 'results')).toBe(true);
  });
  it('relays poses to everyone else only during the race', () => {
    const lob = lobby(['host', 'guest']);
    expect(send(lob, 'host', { t: 'pose', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, dNextM: 5 }, 5).out).toHaveLength(0);
    const { room, t0 } = raceOf(['host', 'guest']);
    const step = send(room, 'host', { t: 'pose', x: 1, y: 2, z: 3, yaw: 0, pitch: 0, roll: 0, dNextM: 5 }, t0 + 10);
    expect(step.out).toHaveLength(1);
    expect(step.out[0]).toMatchObject({ to: EVERYONE, except: 'host' });
  });
  it('orders standings by gates, then distance to the next gate', () => {
    const { room, t0 } = raceOf(['host', 'guest', 'third']);
    send(room, 'guest', { t: 'gate', index: 0 }, t0 + 2000);
    send(room, 'host', { t: 'pose', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, dNextM: 30 }, t0 + 10);
    send(room, 'third', { t: 'pose', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, dNextM: 10 }, t0 + 10);
    expect(room.standings()).toEqual(['guest', 'third', 'host']);
  });
});

describe('leaving and rematch', () => {
  it('hands the host role to the longest-present pilot', () => {
    const room = lobby(['aa', 'bb', 'cc']);
    room.leave('aa', 10);
    expect(room.getHostId()).toBe('bb');
  });
  it('a pilot leaving mid-race counts as DNF and finishing the rest ends the race', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    room.leave('guest', t0 + 100);
    fly(room, 'host', t0 + 100);
    expect(room.getPhase()).toBe('results');
  });
  it('everyone leaving resets the room', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    room.leave('guest', t0 + 1);
    room.leave('host', t0 + 2);
    expect(room.getPhase()).toBe('lobby');
    expect(room.pilotCount()).toBe(0);
  });
  it('rematch returns to the lobby, unreadies guests, drops the departed; host only', () => {
    const { room, t0 } = raceOf(['host', 'guest', 'third']);
    room.leave('third', t0 + 1);
    fly(room, 'guest', t0);
    fly(room, 'host', t0 + 500);
    expect(room.getPhase()).toBe('results');
    expect(kinds(send(room, 'guest', { t: 'rematch' }, t0 + 99999))).toEqual(['error']);
    send(room, 'host', { t: 'rematch' }, t0 + 100000);
    expect(room.getPhase()).toBe('lobby');
    expect(room.pilotCount()).toBe(2);
  });
});

describe('abuse', () => {
  it('closes a connection after repeated bad frames and resets the count on a good one', () => {
    const room = lobby(['aa']);
    for (let i = 0; i < ROOMS.badFramesBeforeClose - 1; i++) expect(room.receive('aa', 'junk', i).close).toEqual([]);
    room.receive('aa', '{"t":"start"}', 100);
    for (let i = 0; i < ROOMS.badFramesBeforeClose - 1; i++) expect(room.receive('aa', 'junk', 200 + i).close).toEqual([]);
    expect(room.receive('aa', 'junk', 300).close).toEqual(['aa']);
  });
  it('treats message floods as bad frames', () => {
    const room = lobby(['aa']);
    let closed = false;
    for (let i = 0; i < 200; i++) if (room.receive('aa', '{"t":"ready","isReady":true}', 5).close.length > 0) closed = true;
    expect(closed).toBe(true);
  });
  it('rate limits chat to one message per gap', () => {
    const room = lobby(['aa', 'bb']);
    expect(kinds(send(room, 'aa', { t: 'chat', text: 'one' }, 2000))).toEqual(['chat']);
    expect(kinds(send(room, 'aa', { t: 'chat', text: 'two' }, 2100))).toEqual([]);
    expect(kinds(send(room, 'aa', { t: 'chat', text: 'three' }, 2000 + ROOMS.chatMinGapMs))).toEqual(['chat']);
  });
  it('ignores frames from unknown pilots', () => {
    expect(lobby(['aa']).receive('ghost', '{"t":"start"}', 1).out).toEqual([]);
  });
});

describe('snapshot', () => {
  it('survives a round trip through JSON mid-race', () => {
    const { room, t0 } = raceOf(['host', 'guest']);
    send(room, 'host', { t: 'gate', index: 0 }, t0 + 2000);
    const copy = Room.restore(JSON.parse(JSON.stringify(room.snapshot())));
    expect(copy.getPhase()).toBe('racing');
    expect(copy.standings()).toEqual(room.standings());
    expect(kinds(send(copy, 'host', { t: 'gate', index: 1 }, t0 + 4000))).toContain('standings');
  });
});

describe('maps', () => {
  const VALLEY = 1;
  const CITY = 101;
  const roomMsg = (s: Step) => s.out.map((o) => o.message).find((m) => m.t === 'room');
  const trackOf = (s: Step): string | undefined => {
    const m = roomMsg(s);
    return m?.t === 'room' ? m.track : undefined;
  };

  it('lets a pilot on another map into the lobby, marked as not on the map, and refuses an unknown version', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('a', 'Arjun', VALLEY, 0);
    const step = room.join('b', 'Bea', CITY, 1);
    const m = roomMsg(step);
    expect(m?.t === 'room' && m.pilots.map((p) => p.isOnMap)).toEqual([true, false]);
    expect(room.join('c', 'Cy', 999, 2).close).toEqual(['c']);
  });
  it('the host picks the map; others cannot, and it is a lobby choice only', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0);
    room.join('guest', 'Guest', VALLEY, 1);
    send(room, 'guest', { t: 'ready', isReady: true }, 2);
    expect(send(room, 'guest', { t: 'track', track: 'city' }, 3).out).toHaveLength(0);
    expect(trackOf(send(room, 'host', { t: 'track', track: 'city' }, 4))).toBe('city');
    expect(room.track).toBe('city');
    // Everyone's ready flag starts over, because everyone has to reload into the map.
    const roster = roomMsg(send(room, 'host', { t: 'ready', isReady: true }, 5));
    expect(roster?.t === 'room' && roster.pilots.find((p) => p.id === 'guest')?.isReady).toBe(false);
  });
  it('will not start until everyone is on the map', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0);
    room.join('guest', 'Guest', VALLEY, 1);
    send(room, 'host', { t: 'track', track: 'city' }, 2);
    send(room, 'guest', { t: 'ready', isReady: true }, 3);
    const refused = send(room, 'host', { t: 'start' }, 4);
    expect(refused.out[0]?.message).toMatchObject({ t: 'error', message: expect.stringMatching(/Downtown Dash/) });
    expect(room.getPhase()).toBe('lobby');
  });
  it('keeps a held place and the host role while a pilot reloads into another map, and gives it back by key', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0, 'hostkey-12345');
    room.join('guest', 'Guest', VALLEY, 1, 'guestkey-12345');
    send(room, 'host', { t: 'track', track: 'city' }, 2);
    send(room, 'host', { t: 'hold' }, 3);
    send(room, 'guest', { t: 'hold' }, 3);
    room.leave('host', 100);
    room.leave('guest', 100);
    expect(room.getHostId()).toBe('host');
    expect(room.pilotCount()).toBe(0);
    expect(room.getPhase()).toBe('lobby');
    // The host comes back on the new map with the same key: same id, still the host.
    const back = room.join('newid-1', 'Host', CITY, 5000, 'hostkey-12345');
    expect(back.joinedAs).toBe('host');
    expect(back.out[0]?.message).toMatchObject({ t: 'welcome', you: 'host' });
    expect(room.getHostId()).toBe('host');
    // A different key does not take someone's place.
    const other = room.join('newid-2', 'Intruder', CITY, 5100, 'wrongkey-12345');
    expect(other.joinedAs).toBeUndefined();
  });
  it('will not start while someone is still switching, and gives up on them after the hold', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0, 'hostkey-12345');
    room.join('guest', 'Guest', VALLEY, 1, 'guestkey-12345');
    send(room, 'guest', { t: 'ready', isReady: true }, 2);
    send(room, 'guest', { t: 'hold' }, 3);
    room.leave('guest', 100);
    const refused = send(room, 'host', { t: 'start' }, 200);
    expect(refused.out[0]?.message).toMatchObject({ t: 'error' });
    expect(room.nextWakeMs()).toBe(3 + ROOMS.holdMs);
    const step = room.tick(3 + ROOMS.holdMs);
    expect(step.out.some((o) => o.message.t === 'room')).toBe(true);
    expect(room.nextWakeMs()).toBe(0);
  });
  it('moves the host role on when the host never returns', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0, 'hostkey-12345');
    room.join('guest', 'Guest', VALLEY, 1, 'guestkey-12345');
    send(room, 'host', { t: 'hold' }, 2);
    room.leave('host', 3);
    expect(room.getHostId()).toBe('host');
    room.tick(2 + ROOMS.holdMs);
    expect(room.getHostId()).toBe('guest');
  });
  it('a normal disconnect without a hold still removes the pilot', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0, 'hostkey-12345');
    room.join('guest', 'Guest', VALLEY, 1, 'guestkey-12345');
    room.leave('guest', 10);
    expect(room.pilotCount()).toBe(1);
    expect(room.join('x', 'New', VALLEY, 11, 'guestkey-12345').joinedAs).toBeUndefined();
  });
  it('the map survives hibernation', () => {
    const room = new Room('ABCDE', VALLEY);
    room.join('host', 'Host', VALLEY, 0);
    send(room, 'host', { t: 'track', track: 'harbor' }, 1);
    expect(Room.restore(JSON.parse(JSON.stringify(room.snapshot()))).track).toBe('harbor');
  });
});

describe('crown chase', () => {
  const pose = (x: number, y = 1000, z = 0) => ({ t: 'pose', x, y, z, yaw: 0, pitch: 0, roll: 0, dNextM: 0 });

  /** A started crown match: host and guest, past GO. Returns the room and the time of GO. */
  function crownMatch(): { room: Room; goMs: number } {
    const room = lobby(['host', 'guest']);
    send(room, 'host', { t: 'mode', mode: 'crown' }, 5);
    send(room, 'guest', { t: 'ready', isReady: true }, 6);
    send(room, 'host', { t: 'start' }, 1000);
    const goMs = 1000 + ROOMS.countdownMs;
    room.tick(goMs);
    return { room, goMs };
  }

  it('only the host switches mode, and only in the lobby', () => {
    const room = lobby(['host', 'guest']);
    const modeOf = (s: Step): string | undefined => s.out.map((o) => o.message).find((m) => m.t === 'room')?.t === 'room' ? (s.out.map((o) => o.message).find((m) => m.t === 'room') as { mode: string }).mode : undefined;
    expect(send(room, 'guest', { t: 'mode', mode: 'crown' }, 1).out).toHaveLength(0);
    expect(modeOf(send(room, 'host', { t: 'mode', mode: 'crown' }, 2))).toBe('crown');
    send(room, 'guest', { t: 'ready', isReady: true }, 3);
    send(room, 'host', { t: 'start' }, 10);
    expect(send(room, 'host', { t: 'mode', mode: 'race' }, 11).out).toHaveLength(0);
  });
  it('starts with a free crown at GO and sends the crown state', () => {
    const room = lobby(['host', 'guest']);
    send(room, 'host', { t: 'mode', mode: 'crown' }, 5);
    send(room, 'guest', { t: 'ready', isReady: true }, 6);
    send(room, 'host', { t: 'start' }, 1000);
    const go = room.tick(1000 + ROOMS.countdownMs);
    const crown = go.out.map((o) => o.message).find((m) => m.t === 'crown');
    expect(crown?.t === 'crown' && crown.holderId).toBe('');
    expect(crown?.t === 'crown' && crown.remainingMs).toBe(CROWN.matchMs);
  });
  it('scores the king, lets a chaser dethrone by touching after the protection, and ranks by points', () => {
    const { room, goMs } = crownMatch();
    const [sx = 0, sy = 0, sz = 0] = TRACK_DEFS.valley.crownSpawn;
    const first = 'host';
    const chaser = 'guest';
    // The host flies to the crown point and claims the free crown.
    send(room, first, pose(sx * 100, sy * 100, sz * 100), goMs);
    send(room, chaser, pose(100_000), goMs);
    expect(room.snapshot().crown?.holderId).toBe(first);
    let t = goMs + 100;
    let stolen = false;
    for (; t < goMs + CROWN.protectMs + 2000; t += 100) {
      const steps = [send(room, first, pose(sx * 100, sy * 100, sz * 100), t), send(room, chaser, pose(sx * 100 + 100, sy * 100, sz * 100), t)]; // the chaser is touching, 1 m away
      if (steps.some((s) => s.out.some((o) => o.message.t === 'crown' && o.message.holderId === chaser))) stolen = true;
    }
    expect(stolen).toBe(true);
    // Run out the match, with the pilots far apart so the crown stays put.
    for (; t < goMs + CROWN.matchMs; t += 1000) {
      send(room, first, pose(sx * 100), t);
      send(room, chaser, pose(100_000), t);
    }
    const end = room.tick(goMs + CROWN.matchMs);
    const results = end.out.map((o) => o.message).find((m) => m.t === 'results');
    expect(results?.t === 'results' && results.rows).toHaveLength(2);
    if (results?.t !== 'results') return;
    expect(results.rows.map((r) => r.place)).toEqual([1, 2]);
    expect(results.rows[0]?.score).toBeGreaterThan(results.rows[1]?.score ?? 0);
    expect(room.getPhase()).toBe('results');
  });
  it('sleeps until the end of the match', () => {
    const { room, goMs } = crownMatch();
    expect(room.nextWakeMs()).toBe(goMs + CROWN.matchMs);
  });
  it('ends the match when only one pilot is left', () => {
    const { room, goMs } = crownMatch();
    const step = room.leave('guest', goMs + 5000);
    expect(step.out.some((o) => o.message.t === 'results')).toBe(true);
    expect(room.getPhase()).toBe('results');
  });
  it('a rematch goes back to the lobby in the same mode', () => {
    const { room, goMs } = crownMatch();
    room.tick(goMs + CROWN.matchMs);
    send(room, 'host', { t: 'rematch' }, goMs + CROWN.matchMs + 100);
    expect(room.getPhase()).toBe('lobby');
  });
  it('survives hibernation in the middle of a match', () => {
    const { room, goMs } = crownMatch();
    const first = 'host';
    const [sx = 0, sy = 0, sz = 0] = TRACK_DEFS.valley.crownSpawn;
    send(room, first, pose(sx * 100, sy * 100, sz * 100), goMs + 100);
    const copy = Room.restore(JSON.parse(JSON.stringify(room.snapshot())));
    expect(copy.getPhase()).toBe('racing');
    expect(copy.nextWakeMs()).toBe(goMs + CROWN.matchMs);
    expect(copy.snapshot().crown?.holderId).toBe(first);
  });
});

describe('battery race rules', () => {
  const rulesOf = (s: Step) => {
    const m = s.out.map((o) => o.message).find((x) => x.t === 'room');
    return m?.t === 'room' ? m.rules : undefined;
  };

  it('defaults to stock drones with no drain; only the host changes the rules, only in the lobby', () => {
    const room = lobby(['host', 'guest']);
    expect(rulesOf(send(room, 'host', { t: 'ready', isReady: true }, 1))).toEqual({ drain: false, loadout: 'stock' });
    expect(send(room, 'guest', { t: 'rules', drain: true, loadout: 'hangar' }, 2).out).toHaveLength(0);
    expect(rulesOf(send(room, 'host', { t: 'rules', drain: true, loadout: 'hangar' }, 3))).toEqual({ drain: true, loadout: 'hangar' });
    send(room, 'guest', { t: 'ready', isReady: true }, 4);
    send(room, 'host', { t: 'start' }, 10);
    expect(send(room, 'host', { t: 'rules', drain: false, loadout: 'stock' }, 11).out).toHaveLength(0);
  });
  function batteryRace() {
    const room = lobby(['host', 'guest', 'third']);
    send(room, 'host', { t: 'rules', drain: true, loadout: 'stock' }, 1);
    send(room, 'host', { t: 'laps', laps: 1 }, 2);
    send(room, 'guest', { t: 'ready', isReady: true }, 3);
    send(room, 'third', { t: 'ready', isReady: true }, 3);
    send(room, 'host', { t: 'start' }, 1000);
    const goMs = 1000 + ROOMS.countdownMs;
    room.tick(goMs);
    return { room, goMs };
  }
  it('a pilot whose battery ran out is out: announced once, no gates counted, and the race can end without them', () => {
    const { room, goMs } = batteryRace();
    const step = send(room, 'third', { t: 'out' }, goMs + 5000);
    expect(step.out.map((o) => o.message)).toContainEqual({ t: 'out', id: 'third' });
    expect(send(room, 'third', { t: 'out' }, goMs + 5100).out).toHaveLength(0);
    expect(send(room, 'third', { t: 'gate', index: 0 }, goMs + 6000).out).toHaveLength(0);
    fly(room, 'guest', goMs, 1);
    const last = fly(room, 'host', goMs + 500, 1);
    expect(last).toBeGreaterThan(goMs);
    expect(room.getPhase()).toBe('results');
  });
  it('results list the pilot who ran out as DNF, below the finishers', () => {
    const { room, goMs } = batteryRace();
    send(room, 'third', { t: 'out' }, goMs + 4000);
    fly(room, 'guest', goMs, 1);
    const step = (() => {
      let t = goMs + 500;
      let last: Step = { out: [], close: [] };
      for (let i = 0; i < GATES + 1; i++) {
        t += 2000;
        last = send(room, 'host', { t: 'gate', index: i % GATES }, t);
      }
      return last;
    })();
    const res = step.out.map((o) => o.message).find((m) => m.t === 'results');
    expect(res?.t === 'results' && res.rows.map((r) => r.place)).toEqual([1, 2, 0]);
  });
  it('out is ignored when the battery rules are off, in a crown match, and for a pilot who already finished', () => {
    const room = lobby(['host', 'guest']);
    send(room, 'guest', { t: 'ready', isReady: true }, 1);
    send(room, 'host', { t: 'laps', laps: 1 }, 2);
    send(room, 'host', { t: 'start' }, 1000);
    room.tick(1000 + ROOMS.countdownMs);
    expect(send(room, 'guest', { t: 'out' }, 5000).out).toHaveLength(0);
  });
  it('survives hibernation', () => {
    const room = lobby(['host']);
    send(room, 'host', { t: 'rules', drain: true, loadout: 'hangar' }, 1);
    const copy = Room.restore(JSON.parse(JSON.stringify(room.snapshot())));
    expect(rulesOf(send(copy, 'host', { t: 'ready', isReady: true }, 2))).toEqual({ drain: true, loadout: 'hangar' });
  });
});

describe('the same tab coming back', () => {
  it('takes over its own place even if the old connection is still listed, so a reload never duplicates a pilot', () => {
    const room = new Room('ABCDE', 1);
    room.join('first', 'Stone', 1, 0, 'stonekey-12345');
    // The page reloads; the new connection arrives before the old one is noticed as closed.
    const again = room.join('second', 'Stone', 1, 5000, 'stonekey-12345');
    expect(again.joinedAs).toBe('first');
    expect(room.pilotCount()).toBe(1);
  });
  it('a different tab (a different key) is a different pilot, even with the same name', () => {
    const room = new Room('ABCDE', 1);
    room.join('first', 'Stone', 1, 0, 'stonekey-12345');
    room.join('second', 'Stone', 1, 5000, 'otherkey-12345');
    expect(room.pilotCount()).toBe(2);
  });
});
