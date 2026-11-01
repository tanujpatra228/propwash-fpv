import { describe, expect, it } from 'vitest';
import { isUnsupportedDevice, type DeviceInfo } from './device';

const desktop: DeviceInfo = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 0,
  isPointerCoarse: false,
  canHover: true,
};

describe('isUnsupportedDevice', () => {
  it('lets a normal desktop through', () => {
    expect(isUnsupportedDevice(desktop)).toBe(false);
  });

  it('lets a touch-screen laptop through (its main pointer is still a mouse or trackpad)', () => {
    expect(isUnsupportedDevice({ ...desktop, maxTouchPoints: 10 })).toBe(false);
  });

  it('blocks phones by user agent', () => {
    expect(isUnsupportedDevice({ ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', platform: 'iPhone', maxTouchPoints: 5, isPointerCoarse: true, canHover: false })).toBe(true);
    expect(isUnsupportedDevice({ ...desktop, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36', platform: 'Linux armv8l' })).toBe(true);
  });

  it('blocks tablets, including an iPad that pretends to be a Mac', () => {
    expect(isUnsupportedDevice({ ...desktop, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isUnsupportedDevice({ ...desktop, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  });

  it('keeps a real Mac (no touch screen) working', () => {
    expect(isUnsupportedDevice({ ...desktop, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('blocks a device whose only input is a finger', () => {
    expect(isUnsupportedDevice({ ...desktop, isPointerCoarse: true, canHover: false })).toBe(true);
  });
});
