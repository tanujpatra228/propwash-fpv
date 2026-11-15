import { AUDIO } from '../config';
import { clamp } from './math';
import { loadJson, saveJson } from './storage';

/** The four mixer sliders, each 0 to 100. */
export interface AudioLevels {
  master: number;
  motors: number;
  effects: number;
  ambience: number;
}

export const AUDIO_LEVEL_RANGE = { min: 0, max: 100, step: 5 } as const;

const KEY = 'audio.v1';
const NAMES = ['master', 'motors', 'effects', 'ambience'] as const;

/** Builds valid levels from anything: numbers are rounded and clamped, anything else falls back to the default. Pure. */
export function sanitizeAudioLevels(raw: unknown): AudioLevels {
  const defaults = AUDIO.defaultLevels;
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const levels: AudioLevels = { ...defaults };
  for (const name of NAMES) {
    const value = source[name];
    if (typeof value === 'number' && Number.isFinite(value)) levels[name] = clamp(Math.round(value), AUDIO_LEVEL_RANGE.min, AUDIO_LEVEL_RANGE.max);
  }
  return levels;
}

/** A slider position as a gain. Squared, so equal slider steps sound like equal loudness steps. */
export function levelToGain(level: number): number {
  const t = clamp(level, AUDIO_LEVEL_RANGE.min, AUDIO_LEVEL_RANGE.max) / AUDIO_LEVEL_RANGE.max;
  return t * t;
}

export function loadAudioLevels(): AudioLevels {
  return sanitizeAudioLevels(loadJson<unknown>(KEY, (v): v is unknown => v !== undefined));
}

export function saveAudioLevels(levels: Readonly<AudioLevels>): void {
  saveJson(KEY, levels);
}
