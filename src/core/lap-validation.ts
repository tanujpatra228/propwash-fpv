import { GHOST, ONLINE, TRACK, WORLD } from '../config';
import { decodeGhost, GHOST_CHANNELS, type GhostData } from './ghost-codec';
import { checkPilotName } from './pilot-name';

/** A lap as sent to the server. */
export interface LapSubmission {
  pilotId: string;
  name: string;
  worldVersion: number;
  lapTimeS: number;
  splitsS: number[];
  ghost: GhostData;
}

export type LapCheck = { ok: true; lap: LapSubmission } | { ok: false; reason: string };

const PILOT_ID = /^[A-Za-z0-9-]+$/;
const SLACK_M = 10;

const fail = (reason: string): LapCheck => ({ ok: false, reason });
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a submitted lap and returns it cleaned (the name normalised), or the reason it was refused.
 * Cheap on purpose (the free plan allows about 10 ms of CPU per request): no 3D maths, one pass over the ghost.
 * Pure, so the game, the server and the tests all use the same rules.
 */
export function validateLapSubmission(body: unknown, currentWorldVersion: number = WORLD.version): LapCheck {
  if (typeof body !== 'object' || body === null) return fail('Bad request.');
  const b = body as Record<string, unknown>;

  const pilotId = b['pilotId'];
  if (typeof pilotId !== 'string' || pilotId.length < ONLINE.pilotIdMinLength || pilotId.length > ONLINE.pilotIdMaxLength || !PILOT_ID.test(pilotId)) {
    return fail('Bad pilot id.');
  }
  const name = checkPilotName(b['name']);
  if (!name.ok) return fail(name.reason);

  if (b['worldVersion'] !== currentWorldVersion) return fail('This lap was set in a different version of the valley.');
  const lapTimeS = b['lapTimeS'];
  if (!isNumber(lapTimeS) || lapTimeS < ONLINE.minLapS || lapTimeS > ONLINE.maxLapS) return fail('That lap time is not possible.');

  const splits = b['splitsS'];
  if (!Array.isArray(splits) || splits.length !== TRACK.gateCount || !splits.every(isNumber)) return fail('Bad split times.');
  for (let i = 1; i < splits.length; i++) {
    const split = splits[i] as number;
    if (split <= 0 || split >= lapTimeS || split <= (splits[i - 1] as number)) return fail('Split times are not in order.');
  }

  const ghost = b['ghost'];
  if (typeof ghost !== 'object' || ghost === null) return fail('Missing ghost.');
  const { hz, data } = ghost as Record<string, unknown>;
  if (hz !== GHOST.hz || typeof data !== 'string' || data.length > ONLINE.maxGhostChars) return fail('Bad ghost.');
  const decoded = decodeGhost({ hz, data });
  if (!decoded) return fail('Bad ghost.');

  const expectedSamples = lapTimeS * GHOST.hz;
  if (Math.abs(decoded.sampleCount - expectedSamples) > expectedSamples * ONLINE.ghostLengthTolerance + 2) {
    return fail('The ghost does not match the lap time.');
  }

  const { samples, sampleCount } = decoded;
  const [startX = 0, startZ = 0] = TRACK.points[0] ?? [0, 0];
  if (Math.hypot((samples[0] ?? 0) - startX, (samples[2] ?? 0) - startZ) > ONLINE.startRadiusM) return fail('The ghost does not start at the start gate.');

  const maxStepM = ONLINE.maxGhostSpeedMps / GHOST.hz;
  const limit = WORLD.bounds.halfSizeM + SLACK_M;
  for (let i = 0; i < sampleCount; i++) {
    const at = i * GHOST_CHANNELS;
    const x = samples[at] ?? Infinity;
    const y = samples[at + 1] ?? Infinity;
    const z = samples[at + 2] ?? Infinity;
    if (Math.abs(x) > limit || Math.abs(z) > limit || y < -50 || y > WORLD.bounds.ceilingM + SLACK_M) return fail('The ghost leaves the valley.');
    if (i > 0) {
      const previous = at - GHOST_CHANNELS;
      const step = Math.hypot(x - (samples[previous] ?? 0), y - (samples[previous + 1] ?? 0), z - (samples[previous + 2] ?? 0));
      if (step > maxStepM) return fail('The ghost jumps too fast.');
    }
  }
  return { ok: true, lap: { pilotId, name: name.name, worldVersion: currentWorldVersion, lapTimeS, splitsS: splits as number[], ghost: { hz: GHOST.hz, data } } };
}
