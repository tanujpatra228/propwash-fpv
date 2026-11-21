import { describe, expect, it } from 'vitest';
import { ROOMS } from '../config';
import { cleanChatText, makeRoomCode, normaliseRoomCode, parseClientMessage } from './room-protocol';

const pose = { t: 'pose', x: 100, y: 500, z: -200, yaw: 10, pitch: -5, roll: 3, dNextM: 40 };

describe('parseClientMessage', () => {
  it('accepts every valid message type', () => {
    for (const m of [{ t: 'ready', isReady: true }, { t: 'laps', laps: 3 }, { t: 'start' }, { t: 'rematch' }, { t: 'chat', text: 'hi' }, { t: 'gate', index: 2 }, pose]) {
      expect(parseClientMessage(JSON.stringify(m)).ok).toBe(true);
    }
  });
  it('rejects junk without throwing', () => {
    for (const bad of ['', 'nope', '[]', 'null', '{"t":"zzz"}', '{"t":"laps","laps":99}', '{"t":"laps","laps":2.5}', '{"t":"ready"}', '{"t":"gate","index":-1}', 42, null, {}]) {
      expect(parseClientMessage(bad).ok).toBe(false);
    }
  });
  it('rejects bad poses', () => {
    for (const change of [{ x: 1.5 }, { x: 1e9 }, { yaw: 9999 }, { y: 'a' }, { dNextM: -1 }, { z: NaN }]) {
      expect(parseClientMessage(JSON.stringify({ ...pose, ...change })).ok).toBe(false);
    }
  });
  it('rejects oversize frames', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: 'a'.repeat(ROOMS.maxFrameBytes) })).ok).toBe(false);
  });
  it('rejects a chat that is empty after cleaning', () => {
    expect(parseClientMessage('{"t":"chat","text":"\\u0000\\u200b  "}').ok).toBe(false);
  });
});

describe('cleanChatText', () => {
  it('strips control and invisible characters, collapses spaces and caps length', () => {
    expect(cleanChatText('a\u0000b‮  c\n\nd')).toBe('ab c d');
    expect(Array.from(cleanChatText('x'.repeat(500))).length).toBe(ROOMS.chatMaxChars);
  });
  it('keeps emoji and other languages', () => {
    expect(cleanChatText('नमस्ते 🏁')).toBe('नमस्ते 🏁');
  });
});

describe('room codes', () => {
  it('generates valid codes and normalises typed ones', () => {
    const code = makeRoomCode(() => 0.5);
    expect(code).toHaveLength(ROOMS.codeLength);
    expect(normaliseRoomCode(` ${code.toLowerCase()} `)).toBe(code);
  });
  it('rejects look-alike and wrong-length codes', () => {
    expect(normaliseRoomCode('ABCDO')).toBeNull();
    expect(normaliseRoomCode('ABC')).toBeNull();
    expect(normaliseRoomCode('AB<DE')).toBeNull();
  });
});

describe('bot messages', () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));
  it('accepts a count and a skill, and rejects anything else', () => {
    expect(parse({ t: 'bots', count: 3, skill: 'hard' }).ok).toBe(true);
    expect(parse({ t: 'bots', count: 0, skill: 'easy' }).ok).toBe(true);
    for (const bad of [{ count: -1, skill: 'easy' }, { count: 6, skill: 'easy' }, { count: 1.5, skill: 'easy' }, { count: 2, skill: 'expert' }, { count: '2', skill: 'easy' }, { skill: 'easy' }]) {
      expect(parse({ t: 'bots', ...bad }).ok).toBe(false);
    }
  });
  it('accepts progress rows and rejects bad ones', () => {
    const row = { id: 'bot-1', gates: 5, timeMs: 12_000, dNextM: 30 };
    expect(parse({ t: 'botProgress', rows: [row] }).ok).toBe(true);
    expect(parse({ t: 'botProgress', rows: [] }).ok).toBe(true);
    expect(parse({ t: 'botProgress', rows: 'x' }).ok).toBe(false);
    expect(parse({ t: 'botProgress', rows: [{ ...row, gates: -1 }] }).ok).toBe(false);
    expect(parse({ t: 'botProgress', rows: [{ ...row, id: 7 }] }).ok).toBe(false);
    expect(parse({ t: 'botProgress', rows: [{ ...row, timeMs: 1e12 }] }).ok).toBe(false);
    expect(parse({ t: 'botProgress', rows: Array.from({ length: 6 }, () => row) }).ok).toBe(false);
  });
  it('the biggest legal progress message fits in one frame', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `bot-${i + 1}`, gates: 61, timeMs: 899_999, dNextM: 99_999 }));
    expect(JSON.stringify({ t: 'botProgress', rows }).length).toBeLessThan(ROOMS.maxFrameBytes);
  });
});
