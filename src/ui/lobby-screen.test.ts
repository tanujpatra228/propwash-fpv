import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../core/room-protocol';
import { startStatus } from './lobby-screen';

const p = (id: string, isReady: boolean, isConnected = true): RosterEntry => ({ id, name: id, isReady, slot: 0, isConnected });

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
