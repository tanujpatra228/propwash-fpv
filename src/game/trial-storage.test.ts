import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK } from '../config';
import { isSavedBestLap, loadBestLap, saveBestLap, type SavedBestLap } from './trial-storage';

const sample = (): SavedBestLap => ({
  lapTimeS: 45.27,
  splitsS: new Array<number>(TRACK.gateCount).fill(3),
  ghost: { hz: 20, data: 'AAAAAA' },
});

describe('trial storage', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
  });
  afterEach(() => void vi.unstubAllGlobals());

  it('round-trips a best lap and keys it by world version', () => {
    expect(saveBestLap(sample())).toBe(true);
    expect([...data.keys()][0]).toMatch(/^pw\.trial\.valley-sprint\.w\d+\.v1$/);
    expect(loadBestLap()).toEqual(sample());
  });

  it('treats corrupt or wrong-shaped data as no best lap', () => {
    data.set([...data.keys()][0] ?? 'pw.trial.valley-sprint.w1.v1', '{broken');
    expect(loadBestLap()).toBeNull();
    expect(isSavedBestLap({ ...sample(), lapTimeS: -3 })).toBe(false);
    expect(isSavedBestLap({ ...sample(), splitsS: [1, 2] })).toBe(false);
    expect(isSavedBestLap({ ...sample(), ghost: { hz: 20 } })).toBe(false);
    expect(isSavedBestLap(null)).toBe(false);
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadBestLap()).toBeNull();
    expect(saveBestLap(sample())).toBe(false);
  });
});
