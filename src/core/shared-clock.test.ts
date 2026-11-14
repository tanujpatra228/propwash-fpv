import { describe, expect, it, vi } from 'vitest';
import { sharedTimeS } from './shared-clock';

describe('sharedTimeS', () => {
  it('follows the wall clock, in seconds, from a fixed start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 0, 1, 0, 0, 10));
    expect(sharedTimeS()).toBeCloseTo(10, 3);
    vi.setSystemTime(Date.UTC(2026, 0, 1, 0, 1, 10));
    expect(sharedTimeS()).toBeCloseTo(70, 3);
    vi.useRealTimers();
  });
});
