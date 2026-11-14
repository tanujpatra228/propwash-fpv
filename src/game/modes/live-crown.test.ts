import { describe, expect, it } from 'vitest';
import { ROOMS } from '../../config';
import type { RosterEntry } from '../../core/room-protocol';
import { LiveCrown, type CrownSession, type CrownUpdate } from './live-crown';
import { makeHost } from './test-host';

const roster: RosterEntry[] = [
  { id: 'me', name: 'Arjun', isReady: true, slot: 1, isConnected: true },
  { id: 'bea', name: 'Bea', isReady: true, slot: 0, isConnected: true },
];
const update = (holderId: string, threatId = '', threat01 = 0): CrownUpdate => ({
  t: 'crown', holderId, threatId, threat01, remainingMs: 95_000,
  scores: [{ id: 'bea', points: 40.6 }, { id: 'me', points: 12 }],
});

function setup(isHost = true) {
  const poses: number[][] = [];
  const state = { crown: update('bea') };
  const session: CrownSession = {
    myId: 'me', mySlot: 1, isHost, roster, others: [],
    get crown() { return state.crown; },
    sendPose: (p) => void poses.push([p.x, p.y, p.z]),
    requestRematch: () => undefined,
  };
  const h = makeHost();
  const mode = new LiveCrown(h.host, session);
  mode.start();
  return { mode, state, poses, ...h };
}
const frame = { isLanded: false };

describe('LiveCrown', () => {
  it('locks input until the server says GO, and has no gates or race panel', () => {
    const { mode } = setup();
    expect(mode.isInputLocked).toBe(true);
    mode.update(0.01, frame);
    expect(mode.hud.countdown).toBe('3');
    mode.onGo();
    expect(mode.isInputLocked).toBe(false);
    expect(mode.hud.race).toBeNull();
  });
  it('starts on its grid slot', () => {
    const { placed } = setup();
    expect(placed).toHaveLength(1);
  });
  it('sends poses at the room rate', () => {
    const { mode, poses } = setup();
    for (let i = 0; i < 20; i++) mode.update(0.05, frame);
    expect(poses.length).toBe(Math.round(20 * 0.05 * ROOMS.poseHz));
  });
  it('lists points with the king marked, highest first, and shows time left', () => {
    const { mode } = setup();
    mode.update(0.01, frame);
    expect(mode.hud.standings?.map((r) => [r.name, r.isMe, r.detail])).toEqual([['♛ Bea', false, '40 s'], ['Arjun', true, '12 s']]);
    expect(mode.hud.modeLabel).toMatch(/1:35 left/);
  });
  it('warns the king when a chaser is close and tells the chaser to touch the king', () => {
    const { mode, state } = setup();
    mode.onGo();
    state.crown = update('me', 'bea', 0.6);
    mode.update(0.01, frame);
    expect(mode.hud.hint).toMatch(/chaser is close/);
    state.crown = update('bea', 'me', 0.6);
    mode.update(0.01, frame);
    expect(mode.hud.hint).toMatch(/Touch the king/);
    state.crown = update('bea');
    mode.update(0.01, frame);
    expect(mode.hud.hint).toMatch(/Touch the king to take the crown/);
  });
  it('flashes a banner when the crown changes hands, and not for the first king', () => {
    const { mode, banners } = setup();
    mode.onCrown(update('bea'));
    expect(banners).toHaveLength(0);
    mode.onCrown(update('me'));
    expect(banners).toEqual(['You have the crown']);
    mode.onCrown(update('bea'));
    expect(banners[1]).toBe('Dethroned');
  });
  it('shows the results with seconds on the crown, a rematch for the host only', () => {
    const rows = [{ id: 'bea', name: 'Bea', place: 1, timeS: 0, bestLapS: 0, score: 101.4 }, { id: 'me', name: 'Arjun', place: 2, timeS: 0, bestLapS: 0, score: 60 }];
    const host = setup(true);
    host.mode.onResults(rows);
    expect(host.offers[0]?.choices).toEqual(['restart', 'menu']);
    const guest = setup(false);
    guest.mode.onResults(rows);
    expect(guest.offers[0]?.choices).toEqual(['menu']);
  });
  it('respawns on its grid slot', () => {
    const { mode, host } = setup();
    const out = mode.respawnPose({ position: host.padPose.position.clone(), yawRad: 0 });
    expect(out.position.equals(host.padPose.position)).toBe(false);
  });
});
