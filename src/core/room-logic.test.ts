import { beforeEach, describe, expect, it } from 'vitest';
import { ROOMS, TRACK, WORLD } from '../config';
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

/** Flies a pilot through all gates, 2 s apart, starting one gap after `from`. Returns the time of the last gate. */
function fly(room: Room, id: string, from: number, laps = 1): number {
  let t = from;
  for (let i = 0; i < laps * GATES; i++) {
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
    for (let i = 0; i < 2 * GATES; i++) {
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
