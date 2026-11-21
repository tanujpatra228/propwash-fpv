import { BOTS, isBotSkill, type BotSkillId } from '../config';
import { clamp } from './math';
import { loadJson, saveJson } from './storage';

const KEY = 'botpace.v1';

/** How each skill's bots are tuned to this pilot: 1 is the skill as listed, above 1 faster. */
export type BotPaces = Record<BotSkillId, number>;

export const DEFAULT_PACES: Readonly<BotPaces> = { easy: 1, medium: 1, hard: 1, pro: 1 };

/** Valid paces from anything: numbers are clamped to the allowed range, anything else is 1. Pure. */
export function sanitizePaces(raw: unknown): BotPaces {
  const paces: BotPaces = { ...DEFAULT_PACES };
  if (typeof raw !== 'object' || raw === null) return paces;
  const source = raw as Record<string, unknown>;
  for (const skill of Object.keys(paces) as BotSkillId[]) {
    const value = source[skill];
    if (isBotSkill(skill) && typeof value === 'number' && Number.isFinite(value)) paces[skill] = clamp(value, BOTS.pace.min, BOTS.pace.max);
  }
  return paces;
}

/** After a solo race: the bots get faster when the pilot beat them all, slower when a bot won. Pure. */
export function nextPace(current: number, didPilotWin: boolean): number {
  return clamp(current * (didPilotWin ? BOTS.pace.faster : BOTS.pace.slower), BOTS.pace.min, BOTS.pace.max);
}

export function loadBotPace(skill: BotSkillId): number {
  return sanitizePaces(loadJson<unknown>(KEY, (v): v is unknown => v !== undefined))[skill];
}

export function saveBotPace(skill: BotSkillId, pace: number): void {
  const paces = sanitizePaces(loadJson<unknown>(KEY, (v): v is unknown => v !== undefined));
  paces[skill] = clamp(pace, BOTS.pace.min, BOTS.pace.max);
  saveJson(KEY, paces);
}

/** "+5%" or "-4%" for the lobby, from a pace. */
export function paceLabel(pace: number): string {
  const percent = Math.round((pace - 1) * 100);
  return percent === 0 ? 'as listed' : `${percent > 0 ? '+' : ''}${percent}%`;
}
