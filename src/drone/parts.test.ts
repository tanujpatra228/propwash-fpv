import { describe, expect, it } from 'vitest';
import { STOCK_STATS } from './drone-stats';
import { buildStats, isStockSetup, setupName, STOCK_SETUP, upgradePrice } from './parts';

describe('buildStats', () => {
  it('stock setup equals the stock stats', () => {
    const s = buildStats(STOCK_SETUP);
    for (const key of Object.keys(STOCK_STATS) as Array<keyof typeof STOCK_STATS>) expect(s[key]).toBeCloseTo(STOCK_STATS[key], 5);
  });
  it('Hauler is grippy, strong, slower and thirsty', () => {
    const s = buildStats({ ...STOCK_SETUP, prop: 'hauler' });
    expect(s).toMatchObject({ gripFactor: 1.3, liftFactor: 1.2, drainFactor: 1.3, topSpeedFactor: 0.88 });
  });
  it('Swift level 3 cuts drain and wobble', () => {
    const s = buildStats({ ...STOCK_SETUP, prop: 'swift', propLevel: 3 });
    expect(s.drainFactor).toBeCloseTo(0.8 * 0.9);
    expect(s.wobble).toBeCloseTo(0.6 * 0.6);
  });
  it('batteries change mass, cells and capacity; level adds capacity', () => {
    const light = buildStats({ ...STOCK_SETUP, battery: 'light' });
    expect(light.massKg).toBeLessThan(STOCK_STATS.massKg);
    expect(light.capacityMah).toBe(1100);
    expect(buildStats({ ...STOCK_SETUP, battery: 'long', batteryLevel: 3 }).capacityMah).toBe(2160);
    const punch = buildStats({ ...STOCK_SETUP, battery: 'punch' });
    expect(punch).toMatchObject({ cells: 6, topSpeedFactor: 1.12, drainFactor: 1.25 });
  });
  it('more blades drain more at the same level', () => {
    const drain = (prop: 'swift' | 'allround' | 'grip' | 'hauler') => buildStats({ ...STOCK_SETUP, prop }).drainFactor;
    expect(drain('swift')).toBeLessThan(drain('allround'));
    expect(drain('allround')).toBeLessThan(drain('grip'));
    expect(drain('grip')).toBeLessThan(drain('hauler'));
  });
});

describe('helpers', () => {
  it('names a setup and detects stock', () => {
    expect(setupName(STOCK_SETUP)).toBe('Allround 3-blade · Standard 1500 mAh'.replace(' mAh', ''));
    expect(isStockSetup(STOCK_SETUP)).toBe(true);
    expect(isStockSetup({ ...STOCK_SETUP, propLevel: 2 })).toBe(false);
  });
  it('upgrade prices', () => {
    expect([upgradePrice(1), upgradePrice(2), upgradePrice(3)]).toEqual([150, 400, null]);
  });
});
