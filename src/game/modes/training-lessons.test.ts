import { describe, expect, it } from 'vitest';
import { LESSONS, LessonRunner, type LessonFrame } from './training-lessons';

const base: LessonFrame = { dtS: 1 / 60, heightM: 0, speedMps: 0, distanceFromPadM: 0, isLanded: true, yawRad: 0, lastPassedGate: -1 };
const frame = (over: Partial<LessonFrame>): LessonFrame => ({ ...base, ...over });
const run = (runner: LessonRunner, seconds: number, over: Partial<LessonFrame>): void => {
  for (let t = 0; t < seconds; t += 1 / 60) runner.update(frame(over));
};

describe('LESSONS', () => {
  it('has six lessons, each with steps', () => {
    expect(LESSONS).toHaveLength(6);
    expect(LESSONS.every((l) => l.steps.length > 0)).toBe(true);
  });
});

describe('lesson 1: take off', () => {
  it('completes at 3 m, not before', () => {
    const r = new LessonRunner(LESSONS[0]!);
    expect(r.update(frame({ heightM: 2.9 }))).toBe(false);
    expect(r.update(frame({ heightM: 3.1 }))).toBe(true);
    expect(r.isComplete).toBe(true);
  });
});

describe('lesson 2: hover and land', () => {
  const lesson = (): LessonRunner => new LessonRunner(LESSONS[1]!);

  it('runs rise, hover, land in order', () => {
    const r = lesson();
    r.update(frame({ heightM: 3.2, isLanded: false }));
    expect(r.steps.map((s) => s.isDone)).toEqual([true, false, false]);
    run(r, 5.1, { heightM: 3, speedMps: 0.5, isLanded: false });
    expect(r.steps.map((s) => s.isDone)).toEqual([true, true, false]);
    r.update(frame({ heightM: 0.1, speedMps: 0.2, distanceFromPadM: 0.5, isLanded: true }));
    expect(r.isComplete).toBe(true);
  });

  it('restarts the hover timer when the drone drifts too fast', () => {
    const r = lesson();
    r.update(frame({ heightM: 3.2, isLanded: false }));
    run(r, 4, { heightM: 3, speedMps: 0.5, isLanded: false });
    run(r, 0.1, { heightM: 3, speedMps: 8, isLanded: false }); // drift
    run(r, 4, { heightM: 3, speedMps: 0.5, isLanded: false });
    expect(r.steps[1]?.isDone).toBe(false);
    run(r, 1.2, { heightM: 3, speedMps: 0.5, isLanded: false });
    expect(r.steps[1]?.isDone).toBe(true);
  });

  it('does not accept a landing far from the pad or a hard one', () => {
    const r = lesson();
    r.update(frame({ heightM: 3.2, isLanded: false }));
    run(r, 5.1, { heightM: 3, speedMps: 0.5, isLanded: false });
    r.update(frame({ heightM: 0.1, speedMps: 0.2, distanceFromPadM: 6, isLanded: true }));
    expect(r.isComplete).toBe(false);
    r.update(frame({ heightM: 0.1, speedMps: 3, distanceFromPadM: 0.5, isLanded: true }));
    expect(r.isComplete).toBe(false);
  });

  it('keeps finished steps finished', () => {
    const r = lesson();
    r.update(frame({ heightM: 3.2, isLanded: false }));
    r.update(frame({ heightM: 0.1 }));
    expect(r.steps[0]?.isDone).toBe(true);
  });
});

describe('lesson 3: fly forward', () => {
  it('needs the distance and then the landing', () => {
    const r = new LessonRunner(LESSONS[2]!);
    r.update(frame({ distanceFromPadM: 39, isLanded: false }));
    expect(r.steps[0]?.isDone).toBe(false);
    r.update(frame({ distanceFromPadM: 41, isLanded: false }));
    expect(r.steps[0]?.isDone).toBe(true);
    r.update(frame({ distanceFromPadM: 1, isLanded: true, heightM: 0.1 }));
    expect(r.isComplete).toBe(true);
  });
});

describe('lesson 4: turn', () => {
  it('counts a full circle left then right, through the angle wrap', () => {
    const r = new LessonRunner(LESSONS[3]!);
    const wrap = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.05) r.update(frame({ yawRad: wrap(a), isLanded: false }));
    expect(r.steps.map((s) => s.isDone)).toEqual([true, false]);
    for (let a = Math.PI * 2; a >= -0.2; a -= 0.05) r.update(frame({ yawRad: wrap(a), isLanded: false }));
    expect(r.isComplete).toBe(true);
  });

  it('does not count turning the wrong way for the first step', () => {
    const r = new LessonRunner(LESSONS[3]!);
    for (let a = 0; a >= -Math.PI * 2 - 0.2; a -= 0.05) r.update(frame({ yawRad: a - Math.PI * 2 * Math.round(a / (Math.PI * 2)) }));
    expect(r.steps[0]?.isDone).toBe(false);
  });
});

describe('lessons 5 and 6: gates', () => {
  it('lesson 5 needs the start gate', () => {
    const r = new LessonRunner(LESSONS[4]!);
    r.update(frame({ lastPassedGate: -1 }));
    expect(r.isComplete).toBe(false);
    r.update(frame({ lastPassedGate: 0 }));
    expect(r.isComplete).toBe(true);
  });

  it('lesson 6 needs the first four gates', () => {
    const r = new LessonRunner(LESSONS[5]!);
    r.update(frame({ lastPassedGate: 2 }));
    expect(r.isComplete).toBe(false);
    r.update(frame({ lastPassedGate: 3 }));
    expect(r.isComplete).toBe(true);
  });
});
