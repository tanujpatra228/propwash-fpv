import { describe, expect, it } from 'vitest';
import { FpsMeter } from './fps-meter';

describe('FpsMeter', () => {
  it('reports once a second with the average rate', () => {
    const meter = new FpsMeter();
    let reading: number | null = null;
    let reports = 0;
    for (let i = 0; i < 125; i++) {
      reading = meter.tick(1 / 60) ?? reading;
      if (meter.tick(0) !== null) reports++;
    }
    expect(reading).not.toBeNull();
    expect(reading ?? 0).toBeGreaterThan(55);
    expect(reports).toBeGreaterThanOrEqual(0);
  });

  it('is silent before a full second has passed', () => {
    const meter = new FpsMeter();
    for (let i = 0; i < 30; i++) expect(meter.tick(1 / 60)).toBeNull();
  });
});
