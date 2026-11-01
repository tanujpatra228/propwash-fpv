import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from './modes/training-lessons';
import { loadCompletedLessons, saveCompletedLessons, trainingMenuText } from './training-progress';

describe('training progress', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  });
  afterEach(() => void vi.unstubAllGlobals());

  it('starts at zero and round-trips', () => {
    expect(loadCompletedLessons()).toBe(0);
    saveCompletedLessons(3);
    expect(loadCompletedLessons()).toBe(3);
  });

  it('clamps what it saves and ignores corrupt data', () => {
    saveCompletedLessons(99);
    expect(loadCompletedLessons()).toBe(LESSONS.length);
    saveCompletedLessons(-4);
    expect(loadCompletedLessons()).toBe(0);
    data.set('pw.training.v1', '{"completed":"lots"}');
    expect(loadCompletedLessons()).toBe(0);
    data.set('pw.training.v1', '{"completed":2.5}');
    expect(loadCompletedLessons()).toBe(0);
  });

  it('words the menu subtitle', () => {
    expect(trainingMenuText(0)).toContain('six short lessons');
    expect(trainingMenuText(2)).toBe('Lesson 3 of 6 · Fly forward');
    expect(trainingMenuText(6)).toContain('All lessons done');
  });
});
