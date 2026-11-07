/**
 * Live-race wire protocol, shared by the game and the server so both sides agree on every message.
 * Frames are small JSON text. Nothing from the network is trusted: `parseClientMessage` checks every field.
 */
import { ROOMS } from '../config';

export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'results';

/** Positions in whole centimetres, angles in hundredths of a radian. */
export interface PoseFields {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export type ClientMessage =
  | { t: 'ready'; isReady: boolean }
  | { t: 'laps'; laps: number }
  | { t: 'start' }
  | { t: 'rematch' }
  | { t: 'chat'; text: string }
  | { t: 'gate'; index: number }
  | ({ t: 'pose'; dNextM: number } & PoseFields);

export interface RosterEntry {
  id: string;
  name: string;
  isReady: boolean;
  /** Starting-grid slot, 0 to maxPilots - 1. */
  slot: number;
  isConnected: boolean;
}

export interface ResultRow {
  id: string;
  name: string;
  /** 1-based finishing place, or 0 for did-not-finish. */
  place: number;
  timeS: number;
  bestLapS: number;
}

export type ServerMessage =
  | { t: 'welcome'; you: string; code: string }
  | { t: 'room'; phase: RoomPhase; hostId: string; laps: number; pilots: RosterEntry[] }
  | { t: 'countdown'; startsInMs: number }
  | { t: 'go' }
  | { t: 'chat'; from: string; text: string }
  | ({ t: 'pose'; id: string } & PoseFields)
  | { t: 'standings'; order: string[] }
  | { t: 'finish'; id: string; place: number; timeS: number }
  | { t: 'results'; rows: ResultRow[] }
  | { t: 'error'; message: string };

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; reason: string };

const CODE_PATTERN = new RegExp(`^[${ROOMS.codeAlphabet}]{${ROOMS.codeLength}}$`);

export function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

/** Upper-cases and trims what a player typed or pasted; returns null when it is not a valid code. */
export function normaliseRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return isValidRoomCode(code) ? code : null;
}

export function makeRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOMS.codeLength; i++) code += ROOMS.codeAlphabet[Math.floor(random() * ROOMS.codeAlphabet.length)];
  return code;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parsePose(o: Record<string, unknown>): ParseResult {
  const { x, y, z, yaw, pitch, roll, dNextM } = o;
  const lim = ROOMS.poseLimitCm;
  const ang = ROOMS.poseAngleLimit;
  if (!isInt(x, -lim, lim) || !isInt(y, -lim, lim) || !isInt(z, -lim, lim)) return { ok: false, reason: 'bad position' };
  if (!isInt(yaw, -ang, ang) || !isInt(pitch, -ang, ang) || !isInt(roll, -ang, ang)) return { ok: false, reason: 'bad angle' };
  if (!isInt(dNextM, 0, 100_000)) return { ok: false, reason: 'bad distance' };
  return { ok: true, message: { t: 'pose', x, y, z, yaw, pitch, roll, dNextM } };
}

/** Control and invisible characters removed, whitespace collapsed, length capped. */
export function cleanChatText(raw: string): string {
  const stripped = raw.normalize('NFC').replace(/\s+/g, ' ').replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').trim();
  return Array.from(stripped).slice(0, ROOMS.chatMaxChars).join('');
}

/** Checks one text frame from a client. Never throws. */
export function parseClientMessage(frame: unknown): ParseResult {
  if (typeof frame !== 'string') return { ok: false, reason: 'text frames only' };
  if (frame.length > ROOMS.maxFrameBytes) return { ok: false, reason: 'frame too large' };
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return { ok: false, reason: 'not json' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reason: 'not an object' };
  const o = value as Record<string, unknown>;
  switch (o['t']) {
    case 'ready':
      return typeof o['isReady'] === 'boolean' ? { ok: true, message: { t: 'ready', isReady: o['isReady'] } } : { ok: false, reason: 'bad ready' };
    case 'laps':
      return isInt(o['laps'], ROOMS.minLaps, ROOMS.maxLaps) ? { ok: true, message: { t: 'laps', laps: o['laps'] } } : { ok: false, reason: 'bad laps' };
    case 'start':
      return { ok: true, message: { t: 'start' } };
    case 'rematch':
      return { ok: true, message: { t: 'rematch' } };
    case 'chat': {
      if (typeof o['text'] !== 'string') return { ok: false, reason: 'bad chat' };
      const text = cleanChatText(o['text']);
      return text.length > 0 ? { ok: true, message: { t: 'chat', text } } : { ok: false, reason: 'empty chat' };
    }
    case 'gate':
      return isInt(o['index'], 0, 1000) ? { ok: true, message: { t: 'gate', index: o['index'] } } : { ok: false, reason: 'bad gate' };
    case 'pose':
      return parsePose(o);
    default:
      return { ok: false, reason: 'unknown type' };
  }
}

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message);
}
