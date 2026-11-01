import { loadJson, saveJson } from '../core/storage';
import { LESSONS } from './modes/training-lessons';

const KEY = 'training.v1';

interface Saved {
  completed: number;
}

function isSaved(value: unknown): value is Saved {
  if (typeof value !== 'object' || value === null) return false;
  const { completed } = value as Record<string, unknown>;
  return typeof completed === 'number' && Number.isInteger(completed) && completed >= 0 && completed <= LESSONS.length;
}

/** How many lessons the pilot has finished (0 to the number of lessons). Corrupt data counts as none. */
export function loadCompletedLessons(): number {
  return loadJson(KEY, isSaved)?.completed ?? 0;
}

export function saveCompletedLessons(completed: number): void {
  saveJson(KEY, { completed: Math.max(0, Math.min(LESSONS.length, completed)) });
}

/** Menu subtitle for the Training button: where the pilot is in the lessons. */
export function trainingMenuText(completed: number): string {
  if (completed <= 0) return 'Learn to fly in six short lessons';
  if (completed >= LESSONS.length) return 'All lessons done. Fly them again';
  return `Lesson ${completed + 1} of ${LESSONS.length} · ${LESSONS[completed]?.title ?? ''}`;
}
