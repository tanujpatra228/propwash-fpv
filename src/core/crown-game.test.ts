import { describe, expect, it } from 'vitest';
import { CROWN } from '../config';
import { CrownGame } from './crown-game';

const PROTECT = CROWN.protectMs;
const SPAWN = [0, 10, 0] as const;

/** A match started at t = 0: the king stands on the crown point (the origin, 10 m up) and takes the crown; a chaser and a third pilot are placed by the caller. */
function match(): CrownGame {
  const g = new CrownGame();
  g.start(['king', 'chaser', 'third'], SPAWN, 0);
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
    g.start(['a', 'b'], SPAWN, 0);
    expect(g.isOver(CROWN.matchMs)).toBe(true);
    g.setPose('a', 0, 10, 0, 0);
    g.advance(0);
    for (let t = 0; t <= CROWN.matchMs + 60_000; t += 1000) {
      g.setPose('a', 0, 10, 0, t);
      g.advance(t);
    }
    expect(g.scores()[0]?.points).toBeLessThanOrEqual(CROWN.matchMs / 1000);
  });
});

describe('CrownGame free crown and the hold limit', () => {
  const FAR: Record<string, [number, number]> = { king: [300, 0], chaser: [500, 0], third: [900, 0] };
  const fresh = (): CrownGame => {
    const g = new CrownGame();
    g.start(['king', 'chaser', 'third'], SPAWN, 0);
    run(g, 0, 2000, () => FAR);
    return g;
  };
  it('starts free: nobody wears the crown until someone reaches the crown point', () => {
    const g = fresh();
    expect(g.holder).toBe('');
    expect(g.scores().every((s) => s.points === 0)).toBe(true);
  });
  it('the first pilot to reach the crown point claims it, and the closest one wins a tie', () => {
    const g = fresh();
    place(g, 2100, { king: [CROWN.claimRangeM - 1, 0], chaser: [1, 0], third: [900, 0] });
    expect(g.holder).toBe('chaser');
  });
  it('a pilot just outside claim range does not claim it', () => {
    const g = fresh();
    place(g, 2100, { king: [CROWN.claimRangeM + 2, 0], chaser: [500, 0], third: [900, 0] });
    expect(g.holder).toBe('');
  });
  it('the crown drops after the hold limit and reappears after the respawn delay', () => {
    const g = match();
    const away = { king: [200, 0], chaser: [500, 0], third: [900, 0] } as Record<string, [number, number]>;
    run(g, 100, CROWN.holdMaxMs - 100, () => away);
    expect(g.holder).toBe('king');
    expect(g.holdLeftMs(CROWN.holdMaxMs - 100)).toBe(100);
    run(g, CROWN.holdMaxMs, CROWN.holdMaxMs + 100, () => away);
    expect(g.holder).toBe('');
    expect(g.respawnLeftMs(CROWN.holdMaxMs + 100)).toBeGreaterThan(0);
    // A pilot waiting at the crown point cannot take it until it respawns.
    const waiting = { king: [200, 0], chaser: [0, 0], third: [900, 0] } as Record<string, [number, number]>;
    run(g, CROWN.holdMaxMs + 200, CROWN.holdMaxMs + CROWN.respawnMs - 200, () => waiting);
    expect(g.holder).toBe('');
    run(g, CROWN.holdMaxMs + CROWN.respawnMs - 100, CROWN.holdMaxMs + CROWN.respawnMs + 300, () => waiting);
    expect(g.holder).toBe('chaser');
  });
  it('points stop exactly when the hold runs out', () => {
    const g = match();
    const away = { king: [200, 0], chaser: [500, 0], third: [900, 0] } as Record<string, [number, number]>;
    run(g, 100, CROWN.holdMaxMs + 3000, () => away);
    const king = g.scores().find((s) => s.id === 'king');
    expect(king?.points).toBeCloseTo(CROWN.holdMaxMs / 1000, 3);
  });
  it('a new king gets a full hold, not what was left on the old one', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    place(g, 20_000, { king: [0, 0], chaser: [1, 0], third: [900, 0] });
    expect(g.holder).toBe('chaser');
    expect(g.holdLeftMs(20_000)).toBe(CROWN.holdMaxMs);
  });
  it('the crown drops when its king leaves', () => {
    const g = match();
    run(g, 100, PROTECT, () => apart);
    g.remove('king', PROTECT + 100);
    expect(g.holder).toBe('');
    expect(g.respawnLeftMs(PROTECT + 100)).toBe(CROWN.respawnMs);
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
  it('drops the crown when the king leaves', () => {
    const g = match();
    run(g, 100, 4000, () => apart);
    const events = g.remove('king', 4000);
    expect(events[0]).toMatchObject({ type: 'dropped', from: 'king' });
    expect(g.holder).toBe('');
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
