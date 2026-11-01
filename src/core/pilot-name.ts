/**
 * Pilot names: what is allowed, in one place, used by the game (to guide the player) and by the server (to enforce).
 * Letters, numbers, a few separators and emoji are fine. Everything else is rejected, never silently fixed.
 */

export const PILOT_NAME = {
  minLength: 2,
  /** Counted in what the player sees as characters: an emoji, even a family one, is one. */
  maxLength: 12,
  /** Stops a single "character" from hiding a huge pile of invisible code points. */
  maxCodePointsPerCharacter: 12,
  /** Stacked combining marks ("zalgo" text) are limited to this many per character. */
  maxMarksPerCharacter: 2,
} as const;

export type PilotNameResult = { ok: true; name: string } | { ok: false; reason: string };

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Separators allowed between words. */
const SEPARATORS = new Set([' ', '_', '-', '.']);
/** The glue that builds emoji sequences (joiner, variation selector, skin tone, keycap). */
const EMOJI_GLUE = /^[‍️⃣]$|^\p{Emoji_Modifier}$/u;
const VISIBLE = /^[\p{L}\p{N}]$|^\p{Extended_Pictographic}$|^\p{Regional_Indicator}$/u;
const MARK = /^\p{M}$/u;

function isAllowedCodePoint(ch: string): boolean {
  return VISIBLE.test(ch) || SEPARATORS.has(ch) || EMOJI_GLUE.test(ch) || MARK.test(ch);
}

/**
 * Cleans and checks a pilot name. Whitespace is trimmed and runs of spaces become one; the text is normalised so the
 * same name always compares equal. Returns the cleaned name or the reason it was refused (safe to show the player).
 */
export function checkPilotName(raw: unknown): PilotNameResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'Enter a name.' };
  const name = raw.normalize('NFC').replace(/ +/g, ' ').trim();
  if (name.length === 0) return { ok: false, reason: 'Enter a name.' };
  // Check the raw length first so a megabyte of text is refused before any segmenting work.
  if (name.length > PILOT_NAME.maxLength * PILOT_NAME.maxCodePointsPerCharacter) {
    return { ok: false, reason: `Use at most ${PILOT_NAME.maxLength} characters.` };
  }

  const characters = [...segmenter.segment(name)].map((s) => s.segment);
  if (characters.length > PILOT_NAME.maxLength) return { ok: false, reason: `Use at most ${PILOT_NAME.maxLength} characters.` };
  if (characters.length < PILOT_NAME.minLength) return { ok: false, reason: `Use at least ${PILOT_NAME.minLength} characters.` };

  let visibleCount = 0;
  for (const character of characters) {
    const codePoints = [...character];
    if (codePoints.length > PILOT_NAME.maxCodePointsPerCharacter) return { ok: false, reason: 'That name has an unusual character.' };
    if (!codePoints.every(isAllowedCodePoint)) return { ok: false, reason: 'Use letters, numbers, emoji, spaces, _ - or . only.' };
    if (codePoints.filter((c) => MARK.test(c)).length > PILOT_NAME.maxMarksPerCharacter) {
      return { ok: false, reason: 'That name has too many stacked marks.' };
    }
    if (codePoints.some((c) => VISIBLE.test(c))) visibleCount++;
  }
  // Something you can actually see in at least two places, so a name of only spaces or dots cannot sneak through.
  if (visibleCount < PILOT_NAME.minLength) return { ok: false, reason: 'Use at least 2 letters, numbers or emoji.' };
  if (/^[ _.-]|[ _.-]$/.test(name)) return { ok: false, reason: 'Start and end with a letter, number or emoji.' };
  return { ok: true, name };
}
