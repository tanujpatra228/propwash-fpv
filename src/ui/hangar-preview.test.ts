import { describe, expect, it } from 'vitest';
import { STOCK_SETUP } from '../drone/parts';
import { compare, hangarStats } from './hangar-preview';

describe('hangarStats', () => {
  it('stock is 1 across the board', () => {
    const s = hangarStats(STOCK_SETUP);
    expect([s.speed, s.grip]).toEqual([1, 1]);
    expect(s.lift).toBeCloseTo(1, 5);
  });
  it('Hauler flies a shorter time than Swift at the same battery', () => {
    const hauler = hangarStats({ ...STOCK_SETUP, prop: 'hauler' }).flightTimeS;
    const swift = hangarStats({ ...STOCK_SETUP, prop: 'swift' }).flightTimeS;
    expect(swift / hauler).toBeGreaterThan(1.5);
  });
  it('a bigger battery flies longer; a lighter one lifts better', () => {
    expect(hangarStats({ ...STOCK_SETUP, battery: 'long' }).flightTimeS).toBeGreaterThan(hangarStats(STOCK_SETUP).flightTimeS);
    expect(hangarStats({ ...STOCK_SETUP, battery: 'light' }).lift).toBeGreaterThan(1);
  });
  it('compares with a 1% dead zone', () => {
    expect(compare(100, 105)).toBe('better');
    expect(compare(100, 90)).toBe('worse');
    expect(compare(100, 100.5)).toBe('same');
  });
});
