import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PILOT_SETTINGS, loadPilotSettings, sanitizePilotSettings, savePilotSettings } from './pilot-settings';

describe('sanitizePilotSettings', () => {
  it('keeps valid values', () => {
    const s = { fovDeg: 95, uptiltDeg: 30, isTurnInverted: true, units: 'imperial' as const, isWindOn: false };
    expect(sanitizePilotSettings(s)).toEqual(s);
  });

  it('clamps out-of-range numbers and rounds them', () => {
    const s = sanitizePilotSettings({ fovDeg: 500, uptiltDeg: -20.4, isTurnInverted: false, units: 'metric' });
    expect(s.fovDeg).toBe(110);
    expect(s.uptiltDeg).toBe(0);
    expect(sanitizePilotSettings({ fovDeg: 85.6 }).fovDeg).toBe(86);
  });

  it('falls back to defaults for garbage', () => {
    expect(sanitizePilotSettings(null)).toEqual(DEFAULT_PILOT_SETTINGS);
    expect(sanitizePilotSettings('x')).toEqual(DEFAULT_PILOT_SETTINGS);
    expect(sanitizePilotSettings({ fovDeg: 'wide', uptiltDeg: NaN, isTurnInverted: 'yes', units: 'furlongs' })).toEqual(DEFAULT_PILOT_SETTINGS);
  });

  it('defaults match the camera config', () => {
    expect(DEFAULT_PILOT_SETTINGS.fovDeg).toBe(86);
    expect(DEFAULT_PILOT_SETTINGS.uptiltDeg).toBe(25);
  });
});

describe('storage', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  });
  afterEach(() => void vi.unstubAllGlobals());

  it('round-trips and survives corrupt data', () => {
    expect(loadPilotSettings()).toEqual(DEFAULT_PILOT_SETTINGS);
    savePilotSettings({ fovDeg: 100, uptiltDeg: 10, isTurnInverted: true, units: 'imperial', isWindOn: false });
    expect(loadPilotSettings().fovDeg).toBe(100);
    data.set('pw.pilot.v1', '{oops');
    expect(loadPilotSettings()).toEqual(DEFAULT_PILOT_SETTINGS);
  });
});

describe('wind setting', () => {
  it('defaults to on and falls back to on for junk', () => {
    expect(sanitizePilotSettings({}).isWindOn).toBe(true);
    expect(sanitizePilotSettings({ isWindOn: 'yes' }).isWindOn).toBe(true);
    expect(sanitizePilotSettings({ isWindOn: false }).isWindOn).toBe(false);
  });
});
