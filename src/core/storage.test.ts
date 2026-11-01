import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadJson, saveJson } from './storage';

const isNumber = (value: unknown): value is number => typeof value === 'number';

function stubStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  return data;
}

describe('storage', () => {
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => void vi.unstubAllGlobals());

  it('round-trips a valid value', () => {
    stubStorage();
    expect(saveJson('x', 5)).toBe(true);
    expect(loadJson('x', isNumber)).toBe(5);
  });

  it('ignores corrupt or invalid data', () => {
    const data = stubStorage();
    data.set('pw.x', '{not json');
    expect(loadJson('x', isNumber)).toBeNull();
    data.set('pw.x', '"text"');
    expect(loadJson('x', isNumber)).toBeNull();
  });

  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadJson('x', isNumber)).toBeNull();
    expect(saveJson('x', 1)).toBe(false);
  });
});
