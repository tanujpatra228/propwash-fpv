import { GHOST } from '../config';

/** A recorded lap in storage form. `data` is a compact text string. */
export interface GhostData {
  hz: number;
  data: string;
}

/** Values per sample: x, y, z, yaw, pitch, roll. */
export const GHOST_CHANNELS = 6;

// Zigzag + 5-bit groups in a base-64 alphabet: a small change costs one character.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CONTINUE = 32;

export function encodeInts(values: readonly number[]): string {
  let out = '';
  for (const v of values) {
    let n = v >= 0 ? v * 2 : -v * 2 - 1;
    do {
      const group = n % 32;
      n = Math.floor(n / 32);
      out += ALPHABET[group + (n > 0 ? CONTINUE : 0)];
    } while (n > 0);
  }
  return out;
}

/** Returns null for text that is not valid ghost data. */
export function decodeInts(text: string): number[] | null {
  const out: number[] = [];
  let n = 0;
  let scale = 1;
  for (const ch of text) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) return null;
    n += (index % 32) * scale;
    if (index >= CONTINUE) {
      scale *= 32;
      if (scale > 2 ** 40) return null; // absurdly long number: junk
      continue;
    }
    out.push(n % 2 === 0 ? n / 2 : -(n + 1) / 2);
    n = 0;
    scale = 1;
  }
  return scale === 1 ? out : null;
}

export interface DecodedGhost {
  hz: number;
  /** Absolute values, six per sample: x, y, z in metres, then yaw, pitch, roll in radians. */
  samples: Float64Array;
  sampleCount: number;
}

/** Decodes a ghost into absolute positions and angles, or null when it is not clean. No 3D library needed. */
export function decodeGhost(data: GhostData): DecodedGhost | null {
  if (!Number.isFinite(data.hz) || data.hz <= 0 || typeof data.data !== 'string') return null;
  const ints = decodeInts(data.data);
  if (!ints || ints.length === 0 || ints.length % GHOST_CHANNELS !== 0) return null;
  const samples = new Float64Array(ints.length);
  const running = new Array<number>(GHOST_CHANNELS).fill(0);
  for (let i = 0; i < ints.length; i++) {
    const c = i % GHOST_CHANNELS;
    running[c] = (running[c] ?? 0) + (ints[i] ?? 0);
    samples[i] = (running[c] ?? 0) * (c < 3 ? GHOST.positionStepM : GHOST.angleStepRad);
  }
  return { hz: data.hz, samples, sampleCount: ints.length / GHOST_CHANNELS };
}
