import { describe, expect, it } from 'vitest';
import { applyRun, enduranceScore, findChallenge, starsFor, type Records } from './challenge-results';

const three = findChallenge('three')!;
const endurance = findChallenge('endurance')!;

describe('starsFor', () => {
  it('0 when not finished', () => expect(starsFor(three, { isFinished: false, charge01: 0.5, timeS: 100 })).toBe(0));
  it('1 star for a finish with little battery', () => expect(starsFor(three, { isFinished: true, charge01: 0.05, timeS: 100 })).toBe(1));
  it('2 stars with 15% left but over par', () => expect(starsFor(three, { isFinished: true, charge01: 0.2, timeS: three.parS! + 5 })).toBe(2));
  it('3 stars with battery left and under par', () => expect(starsFor(three, { isFinished: true, charge01: 0.2, timeS: three.parS! - 5 })).toBe(3));
  it('par without battery to spare is only 1 star', () => expect(starsFor(three, { isFinished: true, charge01: 0.1, timeS: 100 })).toBe(1));
  it('endurance never gives stars', () => expect(starsFor(endurance, { isFinished: true, charge01: 1, timeS: 1 })).toBe(0));
});

describe('enduranceScore', () => {
  it('adds the fraction of the lap in progress', () => {
    expect(enduranceScore(2, 6, 12)).toBeCloseTo(2.5);
    expect(enduranceScore(0, 0, 12)).toBe(0);
  });
});

describe('applyRun', () => {
  const run = (charge01: number, timeS: number) => ({ isFinished: true, charge01, timeS });
  it('pays only for stars not earned before', () => {
    const records: Records = {};
    expect(applyRun(records, three, run(0.2, 100), null).newStars).toBe(3);
    expect(applyRun(records, three, run(0.2, 90), null).newStars).toBe(0);
    expect(records['three']?.bestTimeS).toBe(90);
  });
  it('a worse run keeps the better stars and time', () => {
    const records: Records = {};
    applyRun(records, three, run(0.2, 100), null);
    const second = applyRun(records, three, run(0.05, 200), null);
    expect(second).toMatchObject({ newStars: 0, isBest: false });
    expect(records['three']).toMatchObject({ stars: 3, bestTimeS: 100 });
  });
  it('later stars add up (1 star first, then 3)', () => {
    const records: Records = {};
    expect(applyRun(records, three, run(0.05, 200), null).newStars).toBe(1);
    expect(applyRun(records, three, run(0.3, 100), null).newStars).toBe(2);
  });
  it('endurance keeps the best score', () => {
    const records: Records = {};
    applyRun(records, endurance, { isFinished: false, charge01: 0, timeS: 100 }, 3.5);
    const worse = applyRun(records, endurance, { isFinished: false, charge01: 0, timeS: 100 }, 2);
    expect(worse.isBest).toBe(false);
    expect(records['endurance']?.bestScore).toBe(3.5);
  });
});
