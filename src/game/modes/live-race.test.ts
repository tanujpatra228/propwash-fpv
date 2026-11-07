import { describe, expect, it } from 'vitest';
import { ROOMS } from '../../config';
import type { RosterEntry } from '../../core/room-protocol';
import { LiveRace, type LiveSession } from './live-race';
import { makeHost, testGates } from './test-host';

const roster: RosterEntry[] = [
  { id: 'me', name: 'Arjun', isReady: true, slot: 0, isConnected: true },
  { id: 'bea', name: 'Bea', isReady: true, slot: 1, isConnected: true },
];

function setup(isHost = true) {
  const sent = { gates: [] as number[], poses: [] as number[][], rematches: 0 };
  const session: LiveSession = {
    myId: 'me', isHost, totalLaps: 2, roster, order: [{ id: 'bea', gates: 14 }, { id: 'me', gates: 3 }],
    sendGate: (i) => void sent.gates.push(i),
    sendPose: (p) => void sent.poses.push([p.x, p.y, p.z, p.dNextM]),
    requestRematch: () => void sent.rematches++,
  };
  const h = makeHost();
  const mode = new LiveRace(h.host, session, 1);
  mode.start();
  return { mode, sent, ...h };
}
const frame = { isLanded: false };

describe('LiveRace', () => {
  it('locks input and shows the countdown until the server says GO', () => {
    const { mode } = setup();
    expect(mode.isInputLocked).toBe(true);
    mode.update(ROOMS.countdownMs / 1000 + 5, frame); // local timer ran out, server has not said go
    expect(mode.isInputLocked).toBe(true);
    expect(mode.hud.countdown).toBe('1');
    mode.onGo();
    expect(mode.isInputLocked).toBe(false);
    mode.update(0.1, frame);
    expect(mode.hud.countdown).toBe('GO');
  });
  it('places the drone on its grid slot facing the first gate', () => {
    const { placed } = setup();
    const first = placed[0]!;
    expect(first.position.z).toBeGreaterThan(testGates[0]!.position.z); // behind gate 0, which faces -Z
    expect(first.position.x).toBeGreaterThan(0); // slot 1 is the right column
  });
  it('sends only gates the tracker accepts, and only once racing', () => {
    const { mode, sent } = setup();
    mode.onGateCrossed(0);
    expect(sent.gates).toEqual([]);
    mode.onGo();
    mode.onGateCrossed(1); // wrong gate
    mode.onGateCrossed(0);
    mode.update(2, frame);
    mode.onGateCrossed(1);
    expect(sent.gates).toEqual([0, 1]);
  });
  it('sends poses about poseHz times a second, in centimetres', () => {
    const { mode, sent, flight } = setup();
    flight.position.set(1.234, 5, -2);
    for (let i = 0; i < 20; i++) mode.update(0.05, frame);
    expect(sent.poses.length).toBe(10);
    expect(sent.poses[0]?.slice(0, 3)).toEqual([123, 500, -200]);
  });
  it('stops reporting gates after finishing and flashes the place', () => {
    const { mode, sent, banners } = setup();
    mode.onGo();
    mode.onFinish('me', 2);
    mode.onGateCrossed(0);
    expect(sent.gates).toEqual([]);
    expect(banners[0]).toMatch(/2nd/);
  });
  it('shows the server order with myself marked', () => {
    const { mode } = setup();
    mode.update(0.01, frame);
    expect(mode.hud.standings?.map((r) => [r.name, r.isMe])).toEqual([['Bea', false], ['Arjun', true]]);
  });
  it('shows each pilot\'s lap from the server gate count', () => {
    const { mode } = setup();
    mode.update(0.01, frame);
    expect(mode.hud.standings?.map((r) => r.lap)).toEqual([2, 1]);
  });
  it('offers a rematch to the host only', () => {
    const rows = [{ id: 'bea', name: 'Bea', place: 1, timeS: 80, bestLapS: 40 }, { id: 'me', name: 'Arjun', place: 0, timeS: 0, bestLapS: 0 }];
    const host = setup(true);
    host.mode.onResults(rows);
    expect(host.offers[0]?.choices).toEqual(['restart', 'menu']);
    expect(host.mode.handleReset()).toBe(true);
    expect(host.sent.rematches).toBe(1);
    const guest = setup(false);
    guest.mode.onResults(rows);
    expect(guest.offers[0]?.choices).toEqual(['menu']);
    guest.mode.handleReset();
    expect(guest.sent.rematches).toBe(0);
  });
  it('respawns at the last passed gate', () => {
    const { mode, host } = setup();
    mode.onGo();
    mode.onGateCrossed(0);
    mode.update(1.5, frame);
    mode.onGateCrossed(1);
    const out = mode.respawnPose({ position: host.padPose.position.clone(), yawRad: 0 });
    expect(Math.abs(out.position.z - testGates[1]!.position.z)).toBeLessThan(5);
  });
});
