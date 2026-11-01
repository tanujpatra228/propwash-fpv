import { describe, expect, it } from 'vitest';
import { isOnScreen } from './ghost-tag';

describe('isOnScreen', () => {
  it('accepts a point in front of the camera and inside the screen', () => {
    expect(isOnScreen(0.2, -0.3, 0.9)).toBe(true);
  });

  it('rejects points behind the camera or outside the screen', () => {
    expect(isOnScreen(0.2, 0.2, 1.2)).toBe(false);
    expect(isOnScreen(1.5, 0, 0.5)).toBe(false);
    expect(isOnScreen(0, -1.2, 0.5)).toBe(false);
    expect(isOnScreen(0.99, 0, 0.5)).toBe(false);
  });
});
