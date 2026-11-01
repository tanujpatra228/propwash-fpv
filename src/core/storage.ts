/** The only place that touches localStorage. The game must work when storage is blocked. */

import { STORAGE_PREFIX } from '../config';

let hasWarned = false;

function warnOnce(error: unknown): void {
  if (hasWarned) return;
  hasWarned = true;
  console.warn('Browser storage unavailable; progress will not be saved.', error);
}

/** Reads a value and checks its shape. Returns null when missing, corrupt or invalid. */
export function loadJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}
