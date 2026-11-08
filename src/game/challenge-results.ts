/** Scoring and saved records for Battery Challenge. Pure logic plus one saved record. */
import { CHALLENGES } from '../config';
import { loadJson, saveJson } from '../core/storage';
import type { PropId } from '../drone/parts';

export interface ChallengeDef {
  id: string;
  name: string;
  blurb: string;
  /** Laps to finish, or null for Endurance. */
  laps: number | null;
  parS: number | null;
  requiredProp: PropId | null;
}

export const CHALLENGE_LIST: readonly ChallengeDef[] = CHALLENGES.list;

export function findChallenge(id: string): ChallengeDef | undefined {
  return CHALLENGE_LIST.find((c) => c.id === id);
}

export interface RunResult {
  /** Whether all the laps were completed (always false for Endurance, which has no finish). */
  isFinished: boolean;
  charge01: number;
  timeS: number;
}

/** 1 star for finishing, 2 with at least 15% battery left, 3 when also under par. Never more than 3, 0 when not finished. */
export function starsFor(def: ChallengeDef, run: RunResult): number {
  if (!run.isFinished || def.laps === null) return 0;
  if (run.charge01 < CHALLENGES.twoStarCharge01) return 1;
  return def.parS !== null && run.timeS <= def.parS ? 3 : 2;
}

/** Endurance score: whole laps plus the fraction of the current lap covered (by gates passed). */
export function enduranceScore(completedLaps: number, gatesPassedInLap: number, gateCount: number): number {
  return completedLaps + Math.min(gatesPassedInLap, gateCount) / gateCount;
}

export interface ChallengeRecord {
  stars: number;
  bestTimeS: number | null;
  bestScore: number | null;
}

export type Records = Record<string, ChallengeRecord>;

const KEY = 'challenges.v1';

function isRecord(value: unknown): value is ChallengeRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const num = (x: unknown): boolean => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0);
  return typeof v['stars'] === 'number' && Number.isInteger(v['stars']) && v['stars'] >= 0 && v['stars'] <= 3 && num(v['bestTimeS']) && num(v['bestScore']);
}

function isRecords(value: unknown): value is Records {
  return typeof value === 'object' && value !== null && Object.values(value).every(isRecord);
}

export const loadRecords = (): Records => loadJson(KEY, isRecords) ?? {};
export const saveRecords = (records: Records): boolean => saveJson(KEY, records);

export interface Outcome {
  record: ChallengeRecord;
  /** Stars earned for the first time (these pay credits). */
  newStars: number;
  isBest: boolean;
}

/** Folds one run into the saved record: best stars, best time (finished runs), best Endurance score. */
export function applyRun(records: Records, def: ChallengeDef, run: RunResult, score: number | null): Outcome {
  const old = records[def.id] ?? { stars: 0, bestTimeS: null, bestScore: null };
  const stars = starsFor(def, run);
  const isFasterFinish = run.isFinished && (old.bestTimeS === null || run.timeS < old.bestTimeS);
  const isBetterScore = score !== null && (old.bestScore === null || score > old.bestScore);
  const record: ChallengeRecord = {
    stars: Math.max(old.stars, stars),
    bestTimeS: isFasterFinish ? run.timeS : old.bestTimeS,
    bestScore: isBetterScore ? score : old.bestScore,
  };
  records[def.id] = record;
  return { record, newStars: Math.max(0, stars - old.stars), isBest: isFasterFinish || isBetterScore };
}

/** Why a challenge cannot be started with this setup, or null when it can. */
export function lockReason(def: ChallengeDef, setup: Readonly<{ prop: PropId }>): string | null {
  if (def.requiredProp === null || setup.prop === def.requiredProp) return null;
  return `Equip the ${def.requiredProp} propellers in the Hangar first.`;
}
