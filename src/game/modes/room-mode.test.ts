import { describe, expect, it } from 'vitest';
import { isRoomMode, type ModeId } from './mode';

describe('isRoomMode', () => {
  it('is true for every mode played in a live room (so the other pilots are drawn) and false for solo modes', () => {
    const modes: ModeId[] = ['free', 'trial', 'training', 'live', 'challenge', 'crown'];
    expect(modes.filter(isRoomMode)).toEqual(['live', 'crown']);
  });
});
