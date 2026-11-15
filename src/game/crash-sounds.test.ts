import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config';
import { CRASH_MESSAGES } from './crash-messages';

describe('crash sounds', () => {
  it('every crash reason the game can show has a sound, and no sound is left over', () => {
    expect(Object.keys(AUDIO.crash.profiles).sort()).toEqual(Object.keys(CRASH_MESSAGES).sort());
  });
});
