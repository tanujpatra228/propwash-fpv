import { QUALITY } from '../config';
import { loadJson, saveJson } from '../core/storage';
import type { QualityId } from '../ui/menu';

const FREE_BATTERY_KEY = 'freeBattery.v1';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Battery drain in free flight. On by default; learners can turn it off. Time trial always drains. */
export function loadFreeBatteryDrain(): boolean {
  return loadJson(FREE_BATTERY_KEY, isBoolean) ?? true;
}

export function saveFreeBatteryDrain(isOn: boolean): void {
  saveJson(FREE_BATTERY_KEY, isOn);
}

const QUALITY_KEY = 'quality.v1';
const isQualityId = (value: unknown): value is QualityId => typeof value === 'string' && value in QUALITY;

export function loadQuality(): QualityId {
  return loadJson(QUALITY_KEY, isQualityId) ?? 'medium';
}

export function saveQuality(quality: QualityId): void {
  saveJson(QUALITY_KEY, quality);
}
