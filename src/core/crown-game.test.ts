import { describe, expect, it } from 'vitest';
import { CROWN } from '../config';
import { CrownGame } from './crown-game';

const PROTECT = CROWN.protectMs;

/** A match started at t = 0: the king at the origin (10 m up), a chaser and a third pilot placed by the caller. */
function match(): CrownGame {
  const g = new CrownGame();
  g.start(['king', 'chaser', 'third'], 'king', 0);
  place(g, 0, { king: [0, 0], chaser: [500, 0], third: [900, 0] });
  return g;
}

/** Sets positions (x, z in metres, 10 m up) at time `t` for the named pilots, then advances the clock. */
function place(g: CrownGame, t: number, at: Record<string, [number, number]>): void {
  for (const [id, [x, z]] of Object.entries(at)) g.setPose(id, x, 10, z, t);
  g.advance(t);
}

/** Everyone refreshes at 10 Hz from `from` to `to`; positions come from `where(t)`. */
function run(g: CrownGame, from: number, to: number, where: (t: number) => Record<string, [number, number]>): void {
  for (let t = from; t <= to; t += 100) place(g, t, where(t));
}

const apart = { king: [0, 0], chaser: [500, 0], third: [900, 0] } as Record<string, [number, number]>;

describe('CrownGame scoring', () => {
  it('gives the king a point per second and nobody else', () => {
    const g = match();
    run(g, 100, 10_000, () => apart);
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

describe('CrownGame dethroning by touching', () => {
  it('a touch takes the crown at once, after the protection', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    expect(g.holder).toBe('chaser');
  });
  it('nothing happens while the king is protected at the start', () => {
    const g = match();
    run(g, 100, PROTECT - 200, () => ({ king: [0, 0], chaser: [1, 0], third: [900, 0] }));
    expect(g.holder).toBe('king');
  });
  it('a near miss does not count', () => {
    const g = match();
    run(g, 100, PROTECT + 3000, () => ({ king: [0, 0], chaser: [CROWN.touchRangeM + 1.5, 0], third: [900, 0] }));
    expect(g.holder).toBe('king');
  });
  it('a fast pass through the king between two updates counts, even though neither update is close', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [-12, 0], third: [900, 0] });
    place(g, PROTECT + 200, { king: [0, 0], chaser: [12, 0], third: [900, 0] }); // flew straight through the king
    expect(g.holder).toBe('chaser');
  });
  it('a pass that stays clear of the king does not count', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [-12, 6], third: [900, 0] });
    place(g, PROTECT + 200, { king: [0, 0], chaser: [12, 6], third: [900, 0] });
    expect(g.holder).toBe('king');
  });
  it('two drones moving side by side do not touch', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    run(g, PROTECT + 100, PROTECT + 3000, (t) => ({ king: [t / 100, 0], chaser: [t / 100, 4], third: [900, 0] }));
    expect(g.holder).toBe('king');
  });
  it('a new king is protected, so the old one cannot touch it straight back', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    expect(g.holder).toBe('chaser');
    run(g, PROTECT + 200, PROTECT + 100 + PROTECT - 300, () => ({ king: [0, 0], chaser: [1, 0], third: [900, 0] }));
    expect(g.holder).toBe('chaser');
    place(g, PROTECT + 100 + PROTECT + 200, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    expect(g.holder).toBe('king');
  });
  it('points follow the crown', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    run(g, PROTECT + 200, PROTECT + 5200, () => ({ king: [100, 0], chaser: [1, 0], third: [900, 0] }));
    const scores = Object.fromEntries(g.scores().map((s) => [s.id, s.points]));
    expect(scores['king']).toBeGreaterThan(3);
    expect(scores['chaser']).toBeGreaterThan(4);
  });
  it('ignores a stale position (a frozen tab cannot touch or be touched)', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    // The chaser sits on the king's spot but stops sending; only the king keeps updating, far later.
    g.setPose('chaser', 0, 10, 0, PROTECT);
    for (let t = PROTECT + CROWN.poseFreshMs + 500; t < PROTECT + 8000; t += 100) place(g, t, { king: [0, 0] });
    expect(g.holder).toBe('king');
  });
  it('the closest drone takes it when two touch at once', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, PROTECT + 100, { king: [0, 0], chaser: [1.5, 0], third: [0.5, 0] });
    expect(g.holder).toBe('third');
  });
});

describe('CrownGame warnings, leaving and saving', () => {
  it('reports how close the nearest chaser is, from nothing at the warning range to full at touching distance', () => {
    const g = match();
    expect(g.threat()).toEqual({ id: '', progress01: 0 });
    place(g, 100, { king: [0, 0], chaser: [CROWN.warnRangeM + 5, 0], third: [900, 0] });
    expect(g.threat().progress01).toBe(0);
    place(g, 200, { king: [0, 0], chaser: [(CROWN.warnRangeM + CROWN.touchRangeM) / 2, 0], third: [900, 0] });
    expect(g.threat().id).toBe('chaser');
    expect(g.threat().progress01).toBeCloseTo(0.5, 5);
  });
  it('passes the crown to the top scorer when the king leaves', () => {
    const g = match();
    run(g, 100, 4000, () => apart);
    const events = g.remove('king', 4000);
    expect(events[0]).toMatchObject({ type: 'stolen', from: 'king' });
    expect(['chaser', 'third']).toContain(g.holder);
    expect(g.pilotCount).toBe(2);
  });
  it('removing a chaser changes nothing about the crown', () => {
    const g = match();
    run(g, 100, 1000, () => apart);
    expect(g.remove('chaser', 1000)).toEqual([]);
    expect(g.holder).toBe('king');
  });
  it('survives a round trip through JSON in the middle of a match', () => {
    const g = match();
    run(g, 100, PROTECT + 1000, () => apart);
    const copy = CrownGame.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(copy.holder).toBe('king');
    place(copy, PROTECT + 1100, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    expect(copy.holder).toBe('chaser');
  });
  it('throttles broadcasts', () => {
    const g = match();
    expect(g.shouldBroadcast(1000)).toBe(true);
    expect(g.shouldBroadcast(1100)).toBe(false);
    expect(g.shouldBroadcast(1000 + CROWN.broadcastEveryMs)).toBe(true);
  });
});
