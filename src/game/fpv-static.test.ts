import { describe, expect, it } from 'vitest';
import { lensFor, staticAmount, type StaticInputs } from './fpv-static';

const base: StaticInputs = { isGoggles: true, isAnalogOn: true, distanceFromPadM: 0, isInFactory: false, crashRemainingS: 0 };

describe('staticAmount', () => {
  it('is clean near the pits', () => {
    expect(staticAmount(base)).toBe(0);
    expect(staticAmount({ ...base, distanceFromPadM: 200 })).toBe(0);
  });

  it('rises with distance and tops out at half strength', () => {
    const mid = staticAmount({ ...base, distanceFromPadM: 340 });
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.5);
    expect(staticAmount({ ...base, distanceFromPadM: 900 })).toBeCloseTo(0.5);
  });

  it('adds a little static inside the factory', () => {
    expect(staticAmount({ ...base, isInFactory: true })).toBeCloseTo(0.12);
  });

  it('is off when analog is off or outside the goggles', () => {
    expect(staticAmount({ ...base, distanceFromPadM: 900, isAnalogOn: false })).toBe(0);
    expect(staticAmount({ ...base, distanceFromPadM: 900, isGoggles: false })).toBe(0);
  });

  it('is strong during a crash in either camera and capped at 1', () => {
    expect(staticAmount({ ...base, isGoggles: false, crashRemainingS: 1.6 })).toBeGreaterThan(0.9);
    expect(staticAmount({ ...base, crashRemainingS: 100 })).toBe(1);
    expect(staticAmount({ ...base, isAnalogOn: false, crashRemainingS: 0.1 })).toBeCloseTo(0.44);
  });

  it('builds the lens look per camera', () => {
    expect(lensFor(true, true, 0.2)).toMatchObject({ fisheye: 1, vignette: 0.85, grain: 0.05, staticAmount: 0.2 });
    expect(lensFor(true, false, 0)).toMatchObject({ grain: 0.012 });
    expect(lensFor(false, true, 0)).toMatchObject({ fisheye: 0, vignette: 0.35 });
  });
});
