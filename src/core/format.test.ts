import { describe, expect, it } from 'vitest';
import { formatDistance, formatHeight, formatHeightUnits, formatSpeed, formatPercent, formatTimeLeft, formatLapTime, formatSpeedKmh, formatSplit, formatTimer } from './format';

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

  it('formats time left and percent', () => {
    expect(formatTimeLeft(80)).toBe('≈ 1:20');
    expect(formatTimeLeft(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatTimeLeft(-5)).toBe('≈ 0:00');
    expect(formatPercent(0.874)).toBe('87%');
    expect(formatPercent(2)).toBe('100%');
  });

  it('formats speed, height and distance in both unit systems', () => {
    expect(formatSpeed(28, 'metric')).toBe('101 km/h');
    expect(formatSpeed(28, 'imperial')).toBe('63 mph');
    expect(formatHeightUnits(2.44, 'metric')).toEqual({ value: '2.4', unit: 'm' });
    expect(formatHeightUnits(2.44, 'imperial')).toEqual({ value: '8.0', unit: 'ft' });
    expect(formatHeightUnits(23.4, 'imperial')).toEqual({ value: '77', unit: 'ft' });
    expect(formatHeightUnits(-1, 'imperial').value).toBe('0.0');
    expect(formatDistance(195, 'metric')).toBe('195m');
    expect(formatDistance(195, 'imperial')).toBe('640ft');
  });
});
