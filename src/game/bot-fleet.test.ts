import { describe, expect, it } from 'vitest';
import { BOTS, ROOMS } from '../config';
import type { RosterEntry } from '../core/room-protocol';
import type { RemotePose } from '../net/snapshot-buffer';
import { BotFleet } from './bot-fleet';

const entry = (id: string, slot: number, isBot: boolean): RosterEntry => ({ id, name: id, isReady: true, slot, isConnected: true, isOnMap: true, isBot });
const roster = [entry('me', 0, false), entry('bot-1', 1, true), entry('bot-2', 2, true)];

function fleet(laps = 1) {
  const seen = new Map<string, RemotePose[]>();
  const f = new BotFleet((id, pose) => void (seen.get(id) ?? seen.set(id, []).get(id))?.push({ ...pose }));
  f.prepare(roster, 'hard', laps);
  return { f, seen };
}

describe('BotFleet', () => {
  it('makes a bot for every bot in the roster and none for humans', () => {
    expect(fleet().f.count).toBe(2);
  });
  it('holds the bots on the grid before GO and moves them after', () => {
    const { f, seen } = fleet();
    f.update(1000);
    f.update(2000);
    const grid = seen.get('bot-1') ?? [];
    expect(grid[0]).toEqual(grid[1]);
    f.go(2000);
    f.update(12_000);
    const after = seen.get('bot-1')?.at(-1);
    expect(after).toBeDefined();
    expect(Math.hypot((after?.x ?? 0) - (grid[0]?.x ?? 0), (after?.z ?? 0) - (grid[0]?.z ?? 0))).toBeGreaterThan(20);
  });
  it('does not report before GO or in the first half second, then reports every half second', () => {
    const { f } = fleet();
    expect(f.report(100)).toBeNull();
    f.go(1000);
    f.update(1100);
    expect(f.report(1100)).toBeNull();
    f.update(1000 + BOTS.reportEveryMs);
    const rows = f.report(1000 + BOTS.reportEveryMs);
    expect(rows?.map((r) => r.id).sort()).toEqual(['bot-1', 'bot-2']);
    expect(f.report(1000 + BOTS.reportEveryMs + 100)).toBeNull();
  });
  it('reports a finish at once and then stops mentioning that bot', () => {
    const { f } = fleet(1);
    f.go(0);
    const told = new Map<string, number>();
    for (let t = 100; t < 300_000; t += 100) {
      f.update(t);
      for (const row of f.report(t) ?? []) if (row.gates >= 13) told.set(row.id, (told.get(row.id) ?? 0) + 1);
    }
    expect([...told.keys()].sort()).toEqual(['bot-1', 'bot-2']);
    expect([...told.values()]).toEqual([1, 1]);
  });
  it('gives the same bots the same way in every browser: two fleets agree', () => {
    const a = fleet().f;
    const b = fleet().f;
    a.go(0);
    b.go(0);
    a.update(25_000);
    for (let t = 1000; t < 25_000; t += 777) b.update(t);
    b.update(25_000);
    a.update(25_001);
    b.update(25_001);
    expect(a.report(25_001)).toEqual(b.report(25_001));
  });
  it('forgets everything on clear, and the bot count never exceeds the room limit', () => {
    const { f } = fleet();
    f.clear();
    expect(f.count).toBe(0);
    expect(f.report(5)).toBeNull();
    expect(BOTS.maxBots + 1).toBeLessThanOrEqual(ROOMS.maxPilots);
  });
});
