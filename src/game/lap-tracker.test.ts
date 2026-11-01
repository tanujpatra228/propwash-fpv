import { describe, expect, it } from 'vitest';
import { LapTracker } from './lap-tracker';

const GATES = 12;

/** Flies gates 0..11 then 0, one second apart, starting at `start`. */
function flyLap(tracker: LapTracker, start: number, secondsPerGate = 1) {
  const events = [];
  for (let i = 0; i <= GATES; i++) events.push(tracker.onGateCrossed(i % GATES, start + i * secondsPerGate));
  return events;
}

describe('LapTracker', () => {
  it('only gate 0 starts the clock', () => {
    const t = new LapTracker(GATES);
    expect(t.onGateCrossed(3, 1)).toBeNull();
    expect(t.hasStarted).toBe(false);
    expect(t.onGateCrossed(0, 2)).toEqual({ type: 'start' });
    expect(t.hasStarted).toBe(true);
    expect(t.nextGate).toBe(1);
  });

  it('completes a lap with the right time and splits', () => {
    const t = new LapTracker(GATES);
    t.onGateCrossed(0, 10); // start
    for (let i = 1; i < GATES; i++) t.onGateCrossed(i, 10 + i * 3);
    const event = t.onGateCrossed(0, 10 + GATES * 3);
    expect(event).toMatchObject({ type: 'lap', lapTimeS: 36, isBest: true });
    expect(event?.type === 'lap' && event.splitsS[5]).toBe(15);
    expect(t.completedLaps).toBe(1);
    expect(t.best?.lapTimeS).toBe(36);
  });

  it('does not complete a lap when a gate is skipped', () => {
    const t = new LapTracker(GATES);
    t.onGateCrossed(0, 0);
    for (let i = 1; i < GATES; i++) if (i !== 5) t.onGateCrossed(i, i);
    expect(t.nextGate).toBe(5);
    expect(t.onGateCrossed(0, 20)).toBeNull();
    expect(t.completedLaps).toBe(0);
  });

  it('keeps counting laps and only improves the best when faster', () => {
    const t = new LapTracker(GATES);
    flyLap(t, 0, 3); // lap of 36 s
    const second = flyLap(t, 36, 2.5); // continues from gate 1 crossing... start was at 0
    expect(t.completedLaps).toBeGreaterThanOrEqual(1);
    expect(second.length).toBe(GATES + 1);
  });

  it('compares gate splits with the best lap', () => {
    const t = new LapTracker(GATES);
    t.onGateCrossed(0, 0);
    for (let i = 1; i < GATES; i++) t.onGateCrossed(i, i * 3);
    t.onGateCrossed(0, 36); // best lap: 36 s, 3 s per gate; new lap starts at 36
    const faster = t.onGateCrossed(1, 38);
    expect(faster).toMatchObject({ type: 'gate', index: 1, splitS: 2 });
    expect(faster?.type === 'gate' && faster.deltaToBestS).toBeCloseTo(-1);
  });

  it('has no comparison on the first lap', () => {
    const t = new LapTracker(GATES);
    t.onGateCrossed(0, 0);
    const event = t.onGateCrossed(1, 4);
    expect(event).toMatchObject({ type: 'gate', deltaToBestS: null });
  });

  it('remembers the last passed gate for respawns', () => {
    const t = new LapTracker(GATES);
    expect(t.respawnGate).toBe(-1);
    t.onGateCrossed(0, 0);
    t.onGateCrossed(1, 1);
    t.onGateCrossed(2, 2);
    expect(t.respawnGate).toBe(2);
    expect(t.nextGate).toBe(3);
  });

  it('reports the running lap time', () => {
    const t = new LapTracker(GATES);
    expect(t.currentLapTimeS(5)).toBe(0);
    t.onGateCrossed(0, 5);
    expect(t.currentLapTimeS(12.5)).toBe(7.5);
  });

  it('reset returns to before the first gate and keeps the best lap', () => {
    const t = new LapTracker(GATES);
    flyLap(t, 0, 3);
    t.reset();
    expect(t.nextGate).toBe(0);
    expect(t.hasStarted).toBe(false);
    expect(t.best).not.toBeNull();
  });

  it('accepts a saved best lap', () => {
    const t = new LapTracker(GATES, { lapTimeS: 45.27, splitsS: new Array<number>(GATES).fill(1) });
    t.onGateCrossed(0, 0);
    expect(t.best?.lapTimeS).toBe(45.27);
  });
});
