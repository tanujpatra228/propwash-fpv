import { checkPilotName } from '../core/pilot-name';
import { loadJson, saveJson } from '../core/storage';

const ID_KEY = 'pilotId.v1';
const NAME_KEY = 'pilotName.v1';
const isString = (v: unknown): v is string => typeof v === 'string';

let sessionId: string | null = null;

/**
 * A random id that tells this browser's laps apart. It is not a secret and proves nothing about who you are.
 * If storage is blocked it lasts for the session only.
 */
export function getPilotId(): string {
  const saved = loadJson(ID_KEY, isString);
  if (saved && saved.length >= 8) return saved;
  sessionId ??= crypto.randomUUID();
  saveJson(ID_KEY, sessionId);
  return sessionId;
}

/** The saved pilot name, checked again on load, or null when there is none (or it is no longer valid). */
export function loadPilotName(): string | null {
  const saved = loadJson(NAME_KEY, isString);
  if (saved === null) return null;
  const checked = checkPilotName(saved);
  return checked.ok ? checked.name : null;
}

export function savePilotName(name: string): void {
  saveJson(NAME_KEY, name);
}
