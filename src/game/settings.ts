import { loadJson, saveJson } from '../core/storage';

const FREE_BATTERY_KEY = 'freeBattery.v1';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Battery drain in free flight. On by default; learners can turn it off. Time trial always drains. */
export function loadFreeBatteryDrain(): boolean {
  return loadJson(FREE_BATTERY_KEY, isBoolean) ?? true;
}

export function saveFreeBatteryDrain(isOn: boolean): void {
  saveJson(FREE_BATTERY_KEY, isOn);
}
