/** Credits, owned parts and the current setup. Pure logic plus one saved record; the Hangar and modes call into it. */
import { PARTS } from '../config';
import { loadJson, saveJson } from '../core/storage';
import {
  BATTERY_IDS,
  isBatteryId,
  isLevel,
  isPropId,
  kindOf,
  PROP_IDS,
  partPrice,
  STOCK_SETUP,
  upgradePrice,
  type DroneSetup,
  type Level,
  type PartId,
} from '../drone/parts';

const KEY = 'progress.v1';

export interface ProgressState {
  credits: number;
  /** Owned parts and their level. */
  owned: Partial<Record<PartId, Level>>;
  equippedProp: DroneSetup['prop'];
  equippedBattery: DroneSetup['battery'];
}

export type EarnReason = 'lap' | 'personalBest' | 'star';

const EARN: Record<EarnReason, number> = {
  lap: PARTS.credits.perLap,
  personalBest: PARTS.credits.personalBest,
  star: PARTS.credits.perChallengeStar,
};

function freshState(): ProgressState {
  return { credits: 0, owned: { [PARTS.stockProp]: 1, [PARTS.stockBattery]: 1 }, equippedProp: PARTS.stockProp, equippedBattery: PARTS.stockBattery };
}

function isState(value: unknown): value is ProgressState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['credits'] !== 'number' || !Number.isInteger(v['credits']) || v['credits'] < 0) return false;
  if (!isPropId(v['equippedProp']) || !isBatteryId(v['equippedBattery'])) return false;
  const owned = v['owned'];
  if (typeof owned !== 'object' || owned === null) return false;
  const entries = Object.entries(owned);
  if (!entries.every(([id, level]) => (isPropId(id) || isBatteryId(id)) && isLevel(level))) return false;
  const map = owned as Record<string, unknown>;
  return map[v['equippedProp']] !== undefined && map[v['equippedBattery']] !== undefined;
}

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });

export class Progress {
  private state: ProgressState;

  constructor(
    state: ProgressState = freshState(),
    private readonly save: (state: ProgressState) => void = () => undefined,
  ) {
    this.state = structuredClone(state);
  }

  get credits(): number {
    return this.state.credits;
  }

  levelOf(id: PartId): Level | null {
    return this.state.owned[id] ?? null;
  }

  owns(id: PartId): boolean {
    return this.levelOf(id) !== null;
  }

  get setup(): DroneSetup {
    const { equippedProp, equippedBattery, owned } = this.state;
    return { prop: equippedProp, propLevel: owned[equippedProp] ?? 1, battery: equippedBattery, batteryLevel: owned[equippedBattery] ?? 1 };
  }

  isEquipped(id: PartId): boolean {
    return this.state.equippedProp === id || this.state.equippedBattery === id;
  }

  earn(reason: EarnReason, times = 1): number {
    const amount = EARN[reason] * Math.max(0, Math.floor(times));
    if (amount > 0) {
      this.state.credits += amount;
      this.save(this.state);
    }
    return amount;
  }

  buy(id: PartId): Result {
    if (this.owns(id)) return fail('You already own this.');
    const price = partPrice(id);
    if (this.state.credits < price) return fail(`You need ${price - this.state.credits} more credits.`);
    this.state.credits -= price;
    this.state.owned[id] = 1;
    this.save(this.state);
    return { ok: true };
  }

  upgrade(id: PartId): Result {
    const level = this.levelOf(id);
    if (level === null) return fail('Buy it first.');
    const price = upgradePrice(level);
    if (price === null) return fail('Already at the top level.');
    if (this.state.credits < price) return fail(`You need ${price - this.state.credits} more credits.`);
    this.state.credits -= price;
    this.state.owned[id] = (level + 1) as Level;
    this.save(this.state);
    return { ok: true };
  }

  equip(id: PartId): Result {
    if (!this.owns(id)) return fail('Buy it first.');
    if (kindOf(id) === 'prop') this.state.equippedProp = id as DroneSetup['prop'];
    else this.state.equippedBattery = id as DroneSetup['battery'];
    this.save(this.state);
    return { ok: true };
  }
}

export const ALL_PART_IDS: readonly PartId[] = [...PROP_IDS, ...BATTERY_IDS];
export { STOCK_SETUP };

/** Loads saved progress. Corrupt or missing data gives a fresh start (the Hangar says so once). */
export function loadProgress(): { progress: Progress; wasReset: boolean } {
  const saved = loadJson(KEY, isState);
  const progress = new Progress(saved ?? freshState(), (state) => void saveJson(KEY, state));
  return { progress, wasReset: saved === null && hasSavedData() };
}

function hasSavedData(): boolean {
  try {
    return localStorage.getItem(`pw.${KEY}`) !== null;
  } catch {
    return false;
  }
}
