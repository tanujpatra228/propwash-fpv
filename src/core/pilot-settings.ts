import { CAMERA } from '../config';
import { clamp } from './math';
import { loadJson, saveJson } from './storage';

export type Units = 'metric' | 'imperial';

export interface PilotSettings {
  /** Vertical field of view of the goggles camera, in degrees. */
  fovDeg: number;
  /** How far the goggles camera tilts up, in degrees. */
  uptiltDeg: number;
  /** Flip the mouse turn direction. */
  isTurnInverted: boolean;
  units: Units;
  /** Wind in Free flight and Training on maps that have wind. Races and time trials always have it. */
  isWindOn: boolean;
}

export const PILOT_RANGES = {
  fovDeg: { min: 70, max: 110, step: 1 },
  uptiltDeg: { min: 0, max: 50, step: 1 },
} as const;

export const DEFAULT_PILOT_SETTINGS: Readonly<PilotSettings> = {
  fovDeg: CAMERA.goggles.fovDeg,
  uptiltDeg: CAMERA.goggles.uptiltDeg,
  isTurnInverted: false,
  units: 'metric',
  isWindOn: true,
};

const KEY = 'pilot.v1';

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(Math.round(value), min, max) : fallback;
}

/** Builds valid settings from anything: out-of-range numbers are clamped, wrong types fall back to the defaults. Pure. */
export function sanitizePilotSettings(raw: unknown): PilotSettings {
  const d = DEFAULT_PILOT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    fovDeg: number(r['fovDeg'], d.fovDeg, PILOT_RANGES.fovDeg.min, PILOT_RANGES.fovDeg.max),
    uptiltDeg: number(r['uptiltDeg'], d.uptiltDeg, PILOT_RANGES.uptiltDeg.min, PILOT_RANGES.uptiltDeg.max),
    isTurnInverted: typeof r['isTurnInverted'] === 'boolean' ? r['isTurnInverted'] : d.isTurnInverted,
    units: r['units'] === 'imperial' || r['units'] === 'metric' ? r['units'] : d.units,
    isWindOn: typeof r['isWindOn'] === 'boolean' ? r['isWindOn'] : d.isWindOn,
  };
}

export function loadPilotSettings(): PilotSettings {
  return sanitizePilotSettings(loadJson<unknown>(KEY, (v): v is unknown => v !== undefined));
}

export function savePilotSettings(settings: Readonly<PilotSettings>): void {
  saveJson(KEY, settings);
}
