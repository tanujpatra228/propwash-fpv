import { describe, expect, it } from 'vitest';
import { checkPilotName, PILOT_NAME } from './pilot-name';

const ok = (raw: string): string => {
  const result = checkPilotName(raw);
  if (!result.ok) throw new Error(`expected ok for ${JSON.stringify(raw)}: ${result.reason}`);
  return result.name;
};
const bad = (raw: unknown): string => {
  const result = checkPilotName(raw);
  if (result.ok) throw new Error(`expected refusal for ${JSON.stringify(raw)}`);
  return result.reason;
};

describe('pilot names: accepted', () => {
  it('takes ordinary names and trims them', () => {
    expect(ok('Arjun')).toBe('Arjun');
    expect(ok('  Meera  ')).toBe('Meera');
    expect(ok('Sky_Pilot-7')).toBe('Sky_Pilot-7');
    expect(ok('A.B')).toBe('A.B');
  });

  it('collapses runs of spaces into one', () => {
    expect(ok('Fast    Fred')).toBe('Fast Fred');
  });

  it('takes other scripts', () => {
    expect(ok('अर्जुन')).toBe('अर्जुन');
    expect(ok('田中さん')).toBe('田中さん');
    expect(ok('Zoë')).toBe('Zoë');
  });

  it('takes emoji, and counts each emoji as one character', () => {
    expect(ok('🚀🚀')).toBe('🚀🚀');
    expect(ok('Ace🚁')).toBe('Ace🚁');
    expect(ok('👨‍👩‍👧‍👦 Fam')).toBe('👨‍👩‍👧‍👦 Fam'); // a family emoji is one character
    expect(ok('👍🏽👍🏽')).toBe('👍🏽👍🏽');
    expect(ok('🇮🇳 Pilot')).toBe('🇮🇳 Pilot');
  });

  it('takes the maximum length exactly', () => {
    expect(ok('A'.repeat(PILOT_NAME.maxLength))).toHaveLength(PILOT_NAME.maxLength);
    expect(ok('🚀'.repeat(PILOT_NAME.maxLength))).toBe('🚀'.repeat(PILOT_NAME.maxLength));
  });

  it('treats equal-looking names as equal (normalised)', () => {
    expect(ok('Zoë')).toBe(ok('Zoë'));
  });
});

describe('pilot names: refused', () => {
  it('refuses non-text and empty names', () => {
    expect(bad(undefined)).toMatch(/Enter a name/);
    expect(bad(42)).toMatch(/Enter a name/);
    expect(bad(null)).toMatch(/Enter a name/);
    expect(bad('')).toMatch(/Enter a name/);
    expect(bad('     ')).toMatch(/Enter a name/);
  });

  it('refuses names that are too short or too long', () => {
    expect(bad('A')).toMatch(/at least/);
    expect(bad('🚀')).toMatch(/at least/);
    expect(bad('A'.repeat(PILOT_NAME.maxLength + 1))).toMatch(/at most/);
    expect(bad('🚀'.repeat(PILOT_NAME.maxLength + 1))).toMatch(/at most/);
  });

  it('refuses absurdly long input without hanging', () => {
    const started = Date.now();
    expect(bad('x'.repeat(1_000_000))).toMatch(/at most/);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('refuses markup, quotes and symbols', () => {
    for (const name of ['<script>alert(1)</script>', 'a&b', 'say "hi"', "o'neil", 'a/b', 'a\\b', 'x;y', 'a=b', 'a@b', '#1 Pilot', 'a%20b', '{name}', 'a`b']) {
      expect(bad(name)).toMatch(/only|characters/);
    }
  });

  it('refuses control characters and line breaks', () => {
    expect(bad('Ab\ncd')).toMatch(/only/);
    expect(bad('Ab\tcd')).toMatch(/only/);
    expect(bad('Ab\u0000cd')).toMatch(/only/);
    expect(bad('Ab‮cd')).toMatch(/only/); // right-to-left override, used to fake names
  });

  it('refuses invisible padding and zero-width tricks', () => {
    expect(bad('​​​')).toBeTruthy();
    expect(bad('A​B')).toMatch(/only/); // zero-width space
    expect(bad('‍‍')).toBeTruthy(); // joiners only
    expect(bad('⠀⠀⠀')).toBeTruthy(); // braille blank
    expect(bad('  A')).toBeTruthy(); // non-breaking spaces
  });

  it('refuses names with nothing visible in them', () => {
    expect(bad('._-')).toBeTruthy();
    expect(bad('---')).toBeTruthy();
    expect(bad('A _')).toBeTruthy(); // only one visible character
    expect(bad('Ace _')).toMatch(/Start and end/);
    expect(bad('-Ace')).toMatch(/Start and end/);
  });

  it('refuses stacked combining marks (zalgo)', () => {
    expect(bad('Z̀́̂̃̄ab')).toMatch(/stacked|unusual/);
  });

  it('refuses a character that hides a huge pile of code points', () => {
    expect(bad('A' + '́'.repeat(40))).toBeTruthy();
    expect(bad('👨' + '‍👩'.repeat(30))).toBeTruthy();
  });

  it('refuses lone surrogates and other broken text', () => {
    expect(bad('Ab\uD800')).toBeTruthy();
  });
});
