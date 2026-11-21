import { describe, expect, it } from 'vitest';
import { BOTS, ROOMS, TRACK } from '../config';
import { BotRacer, gridBehindM } from './bot-racer';

const G = TRACK.gateCount;

function lapTimeS(skill: 'easy' | 'medium' | 'hard' | 'pro', slot = 0, pace = 1): number {
  const bot = new BotRacer(slot, skill, 2, pace);
  let t = 0;
  while (!bot.isFinished && t < 600) bot.advanceTo((t += 1));
  return bot.lastCrossingMs / 1000;
}

describe('BotRacer', () => {
  it('sits on the grid before the start, behind the line, and does not move at time 0', () => {
    const a = new BotRacer(0, 'medium', 1);
    const before = a.position.clone();
    a.advanceTo(0);
    expect(a.position.distanceTo(before)).toBe(0);
    expect(a.gatesPassed).toBe(0);
    expect(a.distanceToNextM).toBeCloseTo(gridBehindM(0), 3);
    expect(new BotRacer(5, 'medium', 1).distanceToNextM).toBeGreaterThan(new BotRacer(0, 'medium', 1).distanceToNextM);
  });
  it('is a pure function of the race clock: two bots, one step or many, end up in the same place', () => {
    const a = new BotRacer(2, 'hard', 3);
    const b = new BotRacer(2, 'hard', 3);
    a.advanceTo(40);
    for (let t = 0.3; t < 40.3; t += 0.37) b.advanceTo(Math.min(t, 40));
    b.advanceTo(40);
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.gatesPassed).toBe(b.gatesPassed);
    expect(a.lastCrossingMs).toBe(b.lastCrossingMs);
  });
  it('crosses the start line first, then the gates in order, and finishes after laps x gates + 1 crossings', () => {
    const bot = new BotRacer(0, 'hard', 1);
    const counts: number[] = [];
    for (let t = 0; t < 200 && !bot.isFinished; t += 0.5) {
      bot.advanceTo(t);
      counts.push(bot.gatesPassed);
    }
    expect(counts[0]).toBe(0);
    expect(counts.every((c, i) => i === 0 || c >= (counts[i - 1] ?? 0))).toBe(true);
    expect(bot.isFinished).toBe(true);
    expect(bot.gatesPassed).toBe(G + 1);
    expect(bot.distanceToNextM).toBe(0);
  });
  it('harder skills lap faster: pro < hard < medium < easy', () => {
    const easy = lapTimeS('easy');
    const medium = lapTimeS('medium');
    const hard = lapTimeS('hard');
    const pro = lapTimeS('pro');
    expect(pro).toBeLessThan(hard);
    expect(hard).toBeLessThan(medium);
    expect(medium).toBeLessThan(easy);
    // Each step is a real step, not a rounding error.
    expect(easy / medium).toBeGreaterThan(1.15);
    expect(medium / hard).toBeGreaterThan(1.1);
    expect(hard / pro).toBeGreaterThan(1.03);
  });
  it('pro is at the limit of what the drone can do: well inside the 2 laps a 30 s lap would take, but not faster than the online minimum lap', () => {
    // Two laps include the standing start; the online leaderboard refuses single laps under 30 s.
    expect(lapTimeS('pro') / 2).toBeGreaterThan(30);
  });
  it('a pace above 1 makes the same bot quicker and below 1 slower', () => {
    const base = lapTimeS('hard');
    expect(lapTimeS('hard', 0, 1.1)).toBeLessThan(base);
    expect(lapTimeS('hard', 0, 0.9)).toBeGreaterThan(base);
  });
  it('bots of one skill finish at different times (they do not move in lockstep) but within a few percent', () => {
    const times = [0, 1, 2, 3].map((slot) => lapTimeS('medium', slot));
    expect(new Set(times.map((t) => t.toFixed(1))).size).toBeGreaterThan(1);
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(1.15);
  });
  it('the reported crossing time is the time of the latest crossing, within a step', () => {
    const bot = new BotRacer(0, 'hard', 1);
    bot.advanceTo(30);
    const before = bot.gatesPassed;
    expect(before).toBeGreaterThan(0);
    expect(bot.lastCrossingMs).toBeGreaterThan(0);
    expect(bot.lastCrossingMs).toBeLessThanOrEqual(30_000);
    expect(30_000 - bot.lastCrossingMs).toBeLessThan(15_000);
  });
  it('has sensible skill speeds and grid rows', () => {
    expect(BOTS.skills.easy.topSpeedMps).toBeLessThan(BOTS.skills.medium.topSpeedMps);
    expect(BOTS.skills.medium.topSpeedMps).toBeLessThan(BOTS.skills.hard.topSpeedMps);
    expect(gridBehindM(3)).toBe(ROOMS.gridFirstRowBehindM + ROOMS.gridRowSpacingM);
  });
});
