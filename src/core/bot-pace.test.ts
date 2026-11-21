import { describe, expect, it } from 'vitest';
import { BOTS } from '../config';
import { DEFAULT_PACES, nextPace, paceLabel, sanitizePaces } from './bot-pace';

describe('bot pace', () => {
  it('gets faster after a win, slower after a loss, and stays within the limits', () => {
    expect(nextPace(1, true)).toBeCloseTo(BOTS.pace.faster);
    expect(nextPace(1, false)).toBeCloseTo(BOTS.pace.slower);
    let pace = 1;
    for (let i = 0; i < 50; i++) pace = nextPace(pace, true);
    expect(pace).toBe(BOTS.pace.max);
    for (let i = 0; i < 100; i++) pace = nextPace(pace, false);
    expect(pace).toBe(BOTS.pace.min);
  });
  it('wins push harder than losses ease off, so the pilot cannot coast on a streak', () => {
    expect(BOTS.pace.faster - 1).toBeGreaterThan(1 - BOTS.pace.slower);
  });
  it('turns anything into valid paces', () => {
    expect(sanitizePaces(null)).toEqual(DEFAULT_PACES);
    expect(sanitizePaces('fast')).toEqual(DEFAULT_PACES);
    expect(sanitizePaces({ hard: 9, easy: 0.1, medium: 'x', pro: Number.NaN })).toEqual({ easy: BOTS.pace.min, medium: 1, hard: BOTS.pace.max, pro: 1 });
    expect(sanitizePaces({ pro: 1.1 }).pro).toBeCloseTo(1.1);
  });
  it('labels a pace for the lobby', () => {
    expect(paceLabel(1)).toBe('as listed');
    expect(paceLabel(1.1)).toBe('+10%');
    expect(paceLabel(0.92)).toBe('-8%');
  });
});
