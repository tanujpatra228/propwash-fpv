import { describe, expect, it } from 'vitest';
import { BOTS, CROWN, TRACK_DEFS } from '../config';
import { CrownBots, Polyline, type CrownView, type Vec3 } from './crown-bots';
import { TRACK_LINES } from './track-lines';

const line = TRACK_LINES.valley;
const crown = { x: TRACK_DEFS.valley.crownSpawn[0], y: TRACK_DEFS.valley.crownSpawn[1], z: TRACK_DEFS.valley.crownSpawn[2] };

function viewOf(over: Partial<CrownView> & { positions?: Record<string, Vec3> }): CrownView {
  const positions = over.positions ?? {};
  return {
    holderId: over.holderId ?? '',
    isCrownReady: over.isCrownReady ?? true,
    crown,
    positionOf: (id) => positions[id] ?? null,
    pilotIds: over.pilotIds ?? Object.keys(positions),
  };
}

/** Runs the fleet for `seconds` of match time at 10 Hz updates, with the bots' own positions fed back as the room does. */
function run(fleet: CrownBots, seconds: number, view: (positions: Record<string, Vec3>) => CrownView, from = 0): Record<string, Vec3> {
  let positions: Record<string, Vec3> = {};
  for (let t = 0; t <= seconds * 1000; t += 100) {
    positions = Object.fromEntries(fleet.poses().map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
    fleet.step(from + t, view(positions));
  }
  return Object.fromEntries(fleet.poses().map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('Polyline', () => {
  const poly = new Polyline(line);
  it('is a closed loop of about the saved length, and positions wrap', () => {
    expect(poly.lengthM).toBeGreaterThan(line.lengthM * 0.95);
    expect(poly.lengthM).toBeLessThan(line.lengthM * 1.05);
    const a = poly.pointAt(10, { x: 0, y: 0, z: 0 });
    const b = poly.pointAt(10 + poly.lengthM, { x: 0, y: 0, z: 0 });
    expect(distance(a, b)).toBeLessThan(1e-6);
  });
  it('finds the nearest point on the line to a position, and measures the short way round', () => {
    const p = poly.pointAt(200, { x: 0, y: 0, z: 0 });
    expect(Math.abs(poly.delta(poly.nearestS({ x: p.x + 0.5, y: p.y, z: p.z }), 200))).toBeLessThan(2);
    expect(poly.delta(10, poly.lengthM - 10)).toBeCloseTo(-20, 3);
    expect(poly.delta(poly.lengthM - 10, 10)).toBeCloseTo(20, 3);
  });
  it('sees bends: a straight is gentle and the sharpest corner is tight but possible', () => {
    let worst = 0;
    for (let s = 0; s < poly.lengthM; s += 10) worst = Math.max(worst, poly.maxCurvatureAhead(s, 1, 8));
    expect(worst).toBeGreaterThan(0.01);
    expect(1 / worst).toBeGreaterThan(5);
  });
});

describe('CrownBots', () => {
  function fleet(skill: 'easy' | 'medium' | 'hard' | 'pro' = 'hard', n = 1): CrownBots {
    const f = new CrownBots(line);
    f.start(Array.from({ length: n }, (_, i) => ({ id: `bot-${i + 1}`, slot: i + 1 })), skill, 0);
    return f;
  }
  it('starts on the grid behind the start line, at rest, facing along the track', () => {
    const f = fleet('hard', 3);
    const poses = f.poses();
    expect(poses).toHaveLength(3);
    expect(f.velocityOf('bot-1')).toEqual({ x: 0, y: 0, z: 0 });
    expect(new Set(poses.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)).size).toBe(3);
  });
  it('flies to a free crown and reaches it, in a time that depends on skill', () => {
    const arrival = (skill: 'easy' | 'pro'): number => {
      const f = fleet(skill);
      for (let t = 0; t < 120_000; t += 100) {
        const positions = Object.fromEntries(f.poses().map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
        if (distance(positions['bot-1']!, crown) < CROWN.claimRangeM - 0.5) return t;
        f.step(t, viewOf({ positions }));
      }
      return Infinity;
    };
    const pro = arrival('pro');
    const easy = arrival('easy');
    expect(pro).toBeLessThan(Infinity);
    expect(easy).toBeLessThan(Infinity);
    expect(pro).toBeLessThan(easy);
  });
  it('waits at the crown point while the crown respawns instead of wandering off', () => {
    const f = fleet('hard');
    const end = run(f, 90, (positions) => viewOf({ positions, isCrownReady: false }));
    expect(distance(end['bot-1']!, crown)).toBeLessThan(25);
  });
  it('chases a human king, and gets close enough to touch him', () => {
    const f = fleet('pro');
    const king: Vec3 = { x: crown.x, y: crown.y, z: crown.z };
    let closest = Infinity;
    for (let t = 0; t < 90_000; t += 100) {
      const positions: Record<string, Vec3> = { ...Object.fromEntries(f.poses().map((p) => [p.id, { x: p.x, y: p.y, z: p.z }])), human: king };
      closest = Math.min(closest, distance(positions['bot-1']!, king));
      f.step(t, viewOf({ holderId: 'human', positions, pilotIds: ['human', 'bot-1'] }));
    }
    expect(closest).toBeLessThan(CROWN.touchRangeM);
  });
  it('a bot king runs the line, away from the chaser, and keeps moving', () => {
    const f = fleet('pro');
    const chaser: Vec3 = { x: crown.x + 20, y: crown.y, z: crown.z };
    const startPose = f.poses()[0]!;
    const end = run(f, 20, (positions) => viewOf({ holderId: 'bot-1', positions: { ...positions, human: chaser }, pilotIds: ['bot-1', 'human'] }));
    expect(distance(end['bot-1']!, { x: startPose.x, y: startPose.y, z: startPose.z })).toBeGreaterThan(30);
  });
  it('never strays far from the racing line unless it is closing on a target', () => {
    const poly = new Polyline(line);
    const f = fleet('hard', 3);
    let worst = 0;
    for (let t = 0; t < 60_000; t += 100) {
      const positions = Object.fromEntries(f.poses().map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
      for (const p of Object.values(positions)) {
        const s = poly.nearestS(p);
        const on = poly.pointAt(s, { x: 0, y: 0, z: 0 });
        worst = Math.max(worst, distance(p, on));
      }
      f.step(t, viewOf({ positions, isCrownReady: false }));
    }
    // With no king to chase, the only target is the crown point: the bots stay within a few metres of the line.
    expect(worst).toBeLessThan(BOTS.crown.claimApproachM + 2);
  });
  it('does not teleport after a stall: a long gap is caught up in a short, bounded burst', () => {
    const f = fleet('pro');
    f.step(0, viewOf({}));
    const before = f.poses()[0]!;
    f.step(60_000, viewOf({}));
    const after = f.poses()[0]!;
    expect(distance(before, after)).toBeLessThan(BOTS.skills.pro.topSpeedMps * BOTS.crown.maxCatchUpS + 2);
  });
  it('is deterministic: the same inputs give the same bots', () => {
    const a = fleet('hard', 2);
    const b = fleet('hard', 2);
    const endA = run(a, 30, (p) => viewOf({ positions: p }));
    const endB = run(b, 30, (p) => viewOf({ positions: p }));
    expect(endA).toEqual(endB);
  });
  it('survives a snapshot round trip', () => {
    const a = fleet('hard', 2);
    run(a, 10, (p) => viewOf({ positions: p }));
    const b = new CrownBots(line);
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.poses()).toEqual(a.poses());
  });
  it('a removed bot is gone', () => {
    const f = fleet('hard', 2);
    f.remove('bot-1');
    expect(f.ids).toEqual(['bot-2']);
    expect(f.has('bot-1')).toBe(false);
  });
});
