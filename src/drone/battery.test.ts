import { describe, expect, it } from 'vitest';
import { Battery, cellVoltageAt } from './battery';
import { STOCK_STATS } from './drone-stats';

describe('Battery', () => {
  it('hovering for a minute uses about 8 A', () => {
    const b = new Battery(STOCK_STATS);
    b.step(0, 60);
    expect(b.mAhUsed / 1000).toBeCloseTo(0.1333, 3);
    expect(b.charge01).toBeCloseTo(0.911, 2);
  });

  it('full effort for a minute uses about 0.83 Ah', () => {
    const b = new Battery(STOCK_STATS);
    b.step(1, 60);
    expect(b.mAhUsed / 1000).toBeCloseTo(0.8333, 3);
    expect(b.charge01).toBeCloseTo(0.444, 2);
  });

  it('flat-out drains at least 4x faster than hover', () => {
    const hover = new Battery(STOCK_STATS);
    const hard = new Battery(STOCK_STATS);
    hover.step(0, 10);
    hard.step(1, 10);
    expect(hard.mAhUsed / hover.mAhUsed).toBeGreaterThanOrEqual(4);
  });

  it('low battery reduces power, empty cuts it', () => {
    const b = new Battery(STOCK_STATS);
    b.charge01 = 0.1;
    expect(b.powerFactor).toBeCloseTo(0.8);
    expect(b.isLow).toBe(true);
    b.charge01 = 0.5;
    expect(b.powerFactor).toBe(1);
    b.charge01 = 0;
    expect(b.isEmpty).toBe(true);
    expect(b.powerFactor).toBe(0);
  });

  it('never goes below empty and stops drawing', () => {
    const b = new Battery(STOCK_STATS);
    b.step(1, 10000);
    expect(b.charge01).toBe(0);
    b.step(1, 1);
    expect(b.currentA).toBe(0);
  });

  it('voltage follows the curve and sags under load', () => {
    expect(cellVoltageAt(1)).toBeCloseTo(4.2);
    expect(cellVoltageAt(0.5)).toBeCloseTo(3.8);
    expect(cellVoltageAt(0)).toBeCloseTo(3.3);
    expect(cellVoltageAt(0.65)).toBeCloseTo(3.875);
    const b = new Battery(STOCK_STATS);
    const rest = b.voltage;
    b.step(1, 0.1);
    expect(b.voltage).toBeLessThan(rest - 0.5);
  });

  it('refill restores a full pack', () => {
    const b = new Battery(STOCK_STATS);
    b.step(1, 100);
    b.refill();
    expect(b.charge01).toBe(1);
    expect(b.mAhUsed).toBe(0);
  });

  it('time left is finite and shrinks at higher draw', () => {
    const calm = new Battery(STOCK_STATS);
    const hard = new Battery(STOCK_STATS);
    for (let i = 0; i < 100; i++) {
      calm.step(0, 0.1);
      hard.step(1, 0.1);
    }
    expect(hard.estimateSecondsLeft()).toBeLessThan(calm.estimateSecondsLeft());
  });
});
