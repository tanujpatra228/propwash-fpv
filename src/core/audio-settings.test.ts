import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config';
import { levelToGain, sanitizeAudioLevels } from './audio-settings';

describe('audio settings', () => {
  it('uses the defaults for anything that is not an object, and for missing keys', () => {
    expect(sanitizeAudioLevels(null)).toEqual(AUDIO.defaultLevels);
    expect(sanitizeAudioLevels('loud')).toEqual(AUDIO.defaultLevels);
    expect(sanitizeAudioLevels({ master: 40 })).toEqual({ ...AUDIO.defaultLevels, master: 40 });
  });
  it('rounds and clamps numbers and ignores wrong types', () => {
    const levels = sanitizeAudioLevels({ master: 250, motors: -4, effects: 33.6, ambience: 'x' });
    expect(levels).toEqual({ master: 100, motors: 0, effects: 34, ambience: AUDIO.defaultLevels.ambience });
    expect(sanitizeAudioLevels({ master: Number.NaN }).master).toBe(AUDIO.defaultLevels.master);
  });
  it('maps a slider to a gain: silent at 0, full at 100, quieter than linear in between', () => {
    expect(levelToGain(0)).toBe(0);
    expect(levelToGain(100)).toBe(1);
    expect(levelToGain(50)).toBeCloseTo(0.25);
    expect(levelToGain(500)).toBe(1);
  });
});
