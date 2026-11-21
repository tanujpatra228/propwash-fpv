import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../core/room-protocol';
import { startStatus } from './lobby-screen';

const p = (id: string, isReady: boolean, isConnected = true): RosterEntry => ({ id, name: id, isReady, slot: 0, isConnected, isOnMap: true, isBot: false });

describe('startStatus', () => {
  it('only the host can start', () => {
    expect(startStatus({ myId: 'b', hostId: 'a', pilots: [p('a', false), p('b', true)] }).canStart).toBe(false);
  });
  it('needs a second pilot and everyone ready', () => {
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false)] }).canStart).toBe(false);
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false), p('b', false)] }).canStart).toBe(false);
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false), p('b', true)] }).canStart).toBe(true);
  });
  it('ignores pilots who have left', () => {
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false), p('b', false, false), p('c', true)] }).canStart).toBe(true);
  });
});

describe('startStatus label', () => {
  it('counts pilots and ready pilots on the button', () => {
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false)] }).label).toBe('Start race · 1/2 pilots');
    expect(startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false), p('b', false), p('c', true)] }).label).toBe('Start race · 2/3 ready');
  });
});

describe('startStatus with maps', () => {
  it('waits for pilots who are still switching to the room map', () => {
    const away: RosterEntry = { ...p('b', true), isOnMap: false };
    const status = startStatus({ myId: 'a', hostId: 'a', pilots: [p('a', false), away] });
    expect(status.canStart).toBe(false);
    expect(status.hint).toMatch(/switch to the map/);
  });
});
