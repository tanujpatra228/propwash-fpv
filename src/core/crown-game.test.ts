import { describe, expect, it } from 'vitest';
import { CROWN } from '../config';
import { CrownGame } from './crown-game';

/** A match with the king at the origin and a chaser `chaserAtM` metres away, started at t = 0. */
function match(chaserAtM = 3): CrownGame {
  const g = new CrownGame();
  g.start(['king', 'chaser', 'third'], 'king', 0);
  g.setPose('king', 0, 10, 0, 0);
  g.setPose('chaser', chaserAtM, 10, 0, 0);
  g.setPose('third', 500, 10, 0, 0);
  return g;
}

/** Runs the clock forward in 100 ms steps, refreshing poses like the real 10 Hz updates. */
function run(g: CrownGame, fromMs: number, toMs: number, chaserAtM: number): CrownGame {
  for (let t = fromMs; t < toMs; t += 100) {
    g.setPose('king', 0, 10, 0, t);
    g.setPose('chaser', chaserAtM, 10, 0, t);
    g.setPose('third', 500, 10, 0, t);
    g.advance(t + 100);
  }
  return g;
}

const PROTECT = CROWN.protectMs;

describe('CrownGame scoring', () => {
  it('gives the king a point per second and nobody else', () => {
    const g = run(match(100), 0, 10_000, 100);
    const scores = Object.fromEntries(g.scores().map((s) => [s.id, s.points]));
    expect(scores['king']).toBeCloseTo(10, 5);
    expect(scores['chaser']).toBe(0);
  });
  it('never scores past the end of the match', () => {
    const g = new CrownGame();
    g.start(['a', 'b'], 'a', 0);
    g.advance(CROWN.matchMs + 60_000);
    expect(g.scores()[0]?.points).toBeCloseTo(CROWN.matchMs / 1000, 5);
    expect(g.isOver(CROWN.matchMs)).toBe(true);
  });
});

describe('CrownGame dethroning', () => {
  it('is protected at the start, so a chaser in range gets no progress at first', () => {
    const g = run(match(3), 0, PROTECT - 100, 3);
    expect(g.threat().progress01).toBe(0);
  });
  it('a chaser in range for the full time takes the crown', () => {
    const g = run(match(3), 0, PROTECT, 3);
    run(g, PROTECT, PROTECT + CROWN.stealMs + 200, 3);
    expect(g.holder).toBe('chaser');
  });
  it('not quite enough time in range does not steal, and progress drains outside range', () => {
    const g = run(match(3), 0, PROTECT, 3);
    run(g, PROTECT, PROTECT + CROWN.stealMs - 400, 3);
    expect(g.holder).toBe('king');
    expect(g.threat().progress01).toBeGreaterThan(0.7);
    run(g, PROTECT + CROWN.stealMs - 400, PROTECT + CROWN.stealMs + 600, 50);
    expect(g.threat().progress01).toBe(0);
  });
  it('range is 3D: directly above the king counts, far above does not', () => {
    const g = match(3);
    g.setPose('chaser', 0, 10 + CROWN.stealRangeM - 1, 0, 0);
    run(g, 0, PROTECT, 100);
    for (let t = PROTECT; t < PROTECT + CROWN.stealMs + 200; t += 100) {
      g.setPose('king', 0, 10, 0, t);
      g.setPose('chaser', 0, 10 + CROWN.stealRangeM - 1, 0, t);
      g.advance(t + 100);
    }
    expect(g.holder).toBe('chaser');
    const far = run(match(3), 0, PROTECT, 100);
    for (let t = PROTECT; t < PROTECT + 5000; t += 100) {
      far.setPose('king', 0, 10, 0, t);
      far.setPose('chaser', 0, 10 + CROWN.stealRangeM + 3, 0, t);
      far.advance(t + 100);
    }
    expect(far.holder).toBe('king');
  });
  it('a new king is protected, so the old one cannot take it straight back', () => {
    const g = run(match(3), 0, PROTECT + CROWN.stealMs + 200, 3);
    expect(g.holder).toBe('chaser');
    run(g, PROTECT + CROWN.stealMs + 200, PROTECT + CROWN.stealMs + 200 + PROTECT - 300, 3);
    expect(g.holder).toBe('chaser');
  });
  it('points follow the crown', () => {
    const g = run(match(3), 0, PROTECT + CROWN.stealMs + 200 + 5000, 3);
    const scores = Object.fromEntries(g.scores().map((s) => [s.id, s.points]));
    expect(scores['king']).toBeGreaterThan(4);
    expect(scores['chaser']).toBeGreaterThan(4);
  });
  it('ignores a stale position (a frozen tab)', () => {
    const g = run(match(3), 0, PROTECT, 3);
    // The chaser's position stops updating; only the king's does.
    for (let t = PROTECT; t < PROTECT + 6000; t += 100) {
      g.setPose('king', 0, 10, 0, t);
      g.advance(t + 100);
    }
    expect(g.holder).toBe('king');
  });
  it('only one pilot takes it when two are in range: the first to reach the time', () => {
    const g = match(3);
    g.setPose('third', -4, 10, 0, 0);
    run(g, 0, PROTECT, 100);
    let events = 0;
    for (let t = PROTECT; t < PROTECT + 4000; t += 100) {
      for (const [id, x] of [['king', 0], ['chaser', 3], ['third', -4]] as const) g.setPose(id, x, 10, 0, t);
      events += g.advance(t + 100).length;
    }
    expect(events).toBe(1);
    expect(g.threat().progress01).toBeLessThan(1);
  });
});

describe('CrownGame leaving and saving', () => {
  it('passes the crown to the top scorer when the king leaves', () => {
    const g = run(match(100), 0, 4000, 100);
    g.setPose('chaser', 100, 10, 0, 4000);
    const events = g.remove('king', 4000);
    expect(events[0]).toMatchObject({ type: 'stolen', from: 'king' });
    expect(['chaser', 'third']).toContain(g.holder);
    expect(g.pilotCount).toBe(2);
  });
  it('removing a chaser changes nothing about the crown', () => {
    const g = run(match(100), 0, 1000, 100);
    expect(g.remove('chaser', 1000)).toEqual([]);
    expect(g.holder).toBe('king');
  });
  it('survives a round trip through JSON in the middle of a match', () => {
    const g = run(match(3), 0, PROTECT + 800, 3);
    const copy = CrownGame.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(copy.holder).toBe(g.holder);
    expect(copy.threat().progress01).toBeCloseTo(g.threat().progress01, 5);
    run(copy, PROTECT + 800, PROTECT + CROWN.stealMs + 400, 3);
    expect(copy.holder).toBe('chaser');
  });
  it('throttles broadcasts', () => {
    const g = match();
    expect(g.shouldBroadcast(1000)).toBe(true);
    expect(g.shouldBroadcast(1100)).toBe(false);
    expect(g.shouldBroadcast(1000 + CROWN.broadcastEveryMs)).toBe(true);
  });
});
