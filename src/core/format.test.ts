import { describe, expect, it } from 'vitest';
import { formatHeight, formatLapTime, formatSpeedKmh, formatSplit, formatTimer } from './format';

describe('format', () => {
  it('formats lap times', () => {
    expect(formatLapTime(45.27)).toBe('0:45.27');
    expect(formatLapTime(5.5)).toBe('0:05.50');
    expect(formatLapTime(125.04)).toBe('2:05.04');
    expect(formatLapTime(-3)).toBe('0:00.00');
  });

  it('formats splits with sign', () => {
    expect(formatSplit(0.84)).toBe('+0.84');
    expect(formatSplit(-0.12)).toBe('-0.12');
  });

  it('formats the flight timer', () => {
    expect(formatTimer(65.9)).toBe('01:05');
  });

  it('formats speed', () => {
    expect(formatSpeedKmh(28)).toBe('101 km/h');
  });

  it('formats height', () => {
    expect(formatHeight(2.44)).toBe('2.4');
    expect(formatHeight(23.4)).toBe('23');
    expect(formatHeight(-1)).toBe('0.0');
  });
});
