import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GHOST, ONLINE, TRACK, WORLD } from '../config';
import { GhostRecorder } from '../drone/ghost';
import { validateLapSubmission, type LapSubmission } from './lap-validation';

const START = { x: TRACK.points[0]?.[0] ?? 0, z: TRACK.points[0]?.[1] ?? 0 };

/** A believable lap: a loop around the valley at about 26 m/s, starting at the start gate. */
function goodLap(seconds = 45): LapSubmission {
  const recorder = new GhostRecorder();
  const speed = 26;
  const radius = (speed * seconds) / (Math.PI * 2);
  for (let t = 0; t <= seconds; t += 1 / 60) {
    const a = (speed / radius) * t;
    const position = new Vector3(START.x + Math.sin(a) * radius, 8, START.z + radius - Math.cos(a) * radius);
    recorder.record(t, position, new Quaternion().setFromEuler(new Euler(0, -a, 0, 'YXZ')));
  }
  return {
    pilotId: 'a1b2c3d4-e5f6-7890',
    name: 'Arjun',
    worldVersion: WORLD.version,
    lapTimeS: seconds,
    splitsS: Array.from({ length: TRACK.gateCount }, (_, i) => (i * seconds) / TRACK.gateCount),
    ghost: recorder.finish(),
  };
}
const withChange = (lap: LapSubmission, change: Partial<LapSubmission>): unknown => ({ ...lap, ...change });
const reason = (body: unknown): string => {
  const result = validateLapSubmission(body);
  return result.ok ? 'OK' : result.reason;
};

describe('validateLapSubmission: accepted', () => {
  it('accepts a believable lap and cleans the name', () => {
    const result = validateLapSubmission(withChange(goodLap(), { name: '  Fast   Fred ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lap.name).toBe('Fast Fred');
  });

  it('accepts emoji names', () => {
    expect(reason(withChange(goodLap(), { name: '🚀 Rocket' }))).toBe('OK');
  });
});

describe('validateLapSubmission: refused', () => {
  const lap = goodLap();

  it('refuses things that are not a lap', () => {
    for (const body of [null, undefined, 'x', 42, [], {}]) expect(reason(body)).not.toBe('OK');
  });

  it('refuses bad pilot ids', () => {
    for (const pilotId of ['', 'short', 'has spaces here', 'x'.repeat(200), '<script>', 7]) {
      expect(reason(withChange(lap, { pilotId: pilotId as string }))).toBe('Bad pilot id.');
    }
  });

  it('refuses bad names with the name rule reason', () => {
    expect(reason(withChange(lap, { name: '<b>x</b>' }))).toMatch(/only/);
    expect(reason(withChange(lap, { name: 'A'.repeat(40) }))).toMatch(/at most/);
    expect(reason(withChange(lap, { name: 7 as unknown as string }))).toMatch(/name/i);
  });

  it('refuses a different world version', () => {
    expect(reason(withChange(lap, { worldVersion: WORLD.version + 1 }))).toMatch(/version/);
  });

  it('refuses impossible lap times', () => {
    for (const lapTimeS of [0, -5, 20, ONLINE.minLapS - 0.1, ONLINE.maxLapS + 1, NaN, Infinity]) {
      expect(reason(withChange(lap, { lapTimeS }))).toBe('That lap time is not possible.');
    }
  });

  it('refuses bad splits', () => {
    expect(reason(withChange(lap, { splitsS: [1, 2] }))).toBe('Bad split times.');
    expect(reason(withChange(lap, { splitsS: lap.splitsS.map(() => 5) }))).toMatch(/order/);
    expect(reason(withChange(lap, { splitsS: lap.splitsS.map((s) => s + 100) }))).toMatch(/order/);
  });

  it('refuses a ghost that does not decode or is too big', () => {
    expect(reason(withChange(lap, { ghost: { hz: GHOST.hz, data: 'not valid!!' } }))).toBe('Bad ghost.');
    expect(reason(withChange(lap, { ghost: { hz: GHOST.hz, data: 'A'.repeat(ONLINE.maxGhostChars + 1) } }))).toBe('Bad ghost.');
    expect(reason(withChange(lap, { ghost: { hz: 60, data: lap.ghost.data } }))).toBe('Bad ghost.');
    expect(reason(withChange(lap, { ghost: null as unknown as LapSubmission['ghost'] }))).toBe('Missing ghost.');
  });

  it('refuses a ghost whose length does not match the lap time', () => {
    // Claim a different lap time (with matching splits) for a 45 s ghost.
    const claim = (lapTimeS: number): unknown => ({ ...goodLap(45), lapTimeS, splitsS: Array.from({ length: TRACK.gateCount }, (_, i) => (i * lapTimeS) / TRACK.gateCount) });
    expect(reason(claim(90))).toBe('The ghost does not match the lap time.');
    expect(reason(claim(35))).toBe('The ghost does not match the lap time.');
    expect(reason(claim(45.5))).toBe('OK'); // within the sampling tolerance
  });

  it('refuses a ghost that does not start at the start gate', () => {
    const recorder = new GhostRecorder();
    for (let t = 0; t <= 45; t += 1 / 60) recorder.record(t, new Vector3(400 + t * 2, 8, 400), new Quaternion());
    expect(reason(withChange(lap, { ghost: recorder.finish() }))).toBe('The ghost does not start at the start gate.');
  });

  it('refuses a ghost that teleports', () => {
    const recorder = new GhostRecorder();
    for (let t = 0; t <= 45; t += 1 / 60) {
      const x = START.x + (t < 20 ? t * 10 : 400 + t * 10); // jumps 400 m at t = 20
      recorder.record(t, new Vector3(x, 8, START.z), new Quaternion());
    }
    expect(reason(withChange(lap, { ghost: recorder.finish() }))).toBe('The ghost jumps too fast.');
  });

  it('refuses a ghost that leaves the valley', () => {
    const recorder = new GhostRecorder();
    for (let t = 0; t <= 45; t += 1 / 60) recorder.record(t, new Vector3(START.x + Math.min(t * 40, 2000), 8, START.z), new Quaternion());
    expect(reason(withChange(lap, { ghost: recorder.finish() }))).toMatch(/leaves|jumps/);
  });

  it('is cheap: a full 45 s lap validates in a few milliseconds', () => {
    const started = performance.now();
    for (let i = 0; i < 20; i++) validateLapSubmission(lap);
    expect((performance.now() - started) / 20).toBeLessThan(10);
  });
});
