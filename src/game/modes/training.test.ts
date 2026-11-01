import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LESSONS } from './training-lessons';
import { TrainingMode, type ProgressStore } from './training';
import { makeHost } from './test-host';
import type { Pose } from '../respawn';

function memoryStore(initial = 0): ProgressStore & { value: number } {
  const store = { value: initial, load: () => store.value, save: (n: number) => void (store.value = n) };
  return store;
}

const airborne = { isLanded: false };

function setup(initial = 0) {
  const ctx = makeHost();
  const store = memoryStore(initial);
  const mode = new TrainingMode(ctx.host, store);
  mode.start();
  return { ...ctx, mode, store };
}

describe('TrainingMode', () => {
  it('starts on the pad at the first unfinished lesson, with no battery drain or input lock', () => {
    const { mode, placed } = setup(2);
    expect(mode.hud.lesson?.number).toBe(3);
    expect(mode.hud.lesson?.total).toBe(LESSONS.length);
    expect(mode.drainsBattery).toBe(false);
    expect(mode.isInputLocked).toBe(false);
    expect(placed[0]?.position.x).toBe(14);
  });

  it('restarts from lesson 1 once everything is finished', () => {
    expect(setup(LESSONS.length).mode.hud.lesson?.number).toBe(1);
  });

  it('ticks a step when the drone does it, completes the lesson, saves progress and moves on', () => {
    const { mode, flight, store, banners } = setup(0);
    flight.position.set(14, 3.5, 30); // 3.4 m up
    mode.update(1 / 60, airborne);
    expect(mode.hud.lesson?.steps[0]?.isDone).toBe(true);
    expect(store.value).toBe(1);
    expect(banners).toContain('Lesson complete');
    for (let t = 0; t < 3; t += 1 / 60) mode.update(1 / 60, airborne);
    expect(mode.hud.lesson?.number).toBe(2);
  });

  it('never saves less progress than before', () => {
    const { mode, flight, store } = setup(3);
    // Replaying lesson 4 from the start: finishing lesson index 3 would save 4, but never lower the stored value.
    expect(store.load()).toBe(3);
    store.value = 5;
    flight.position.set(14, 3.5, 30);
    mode.hud.lesson && mode.update(1 / 60, airborne);
    expect(store.value).toBeGreaterThanOrEqual(5);
  });

  it('respawns on the pad in early lessons and at the last gate in the gate lessons', () => {
    const early = setup(0);
    const out: Pose = { position: new Vector3(), yawRad: 0 };
    early.mode.onGateCrossed(0);
    expect(early.mode.respawnPose(out).position.x).toBe(14);

    const late = setup(4); // lesson 5
    late.mode.onGateCrossed(0);
    late.mode.onGateCrossed(1);
    late.mode.respawnPose(out);
    expect(out.position.z).toBeCloseTo(-50 - 2);
  });

  it('shows "Training complete" after the last lesson and stops', () => {
    const { mode, banners, tracker } = setup(5); // lesson 6
    mode.onGateCrossed(0);
    mode.onGateCrossed(1);
    mode.onGateCrossed(2);
    mode.onGateCrossed(3);
    expect(tracker.lastPassedGate).toBe(3);
    mode.update(1 / 60, airborne);
    expect(banners).toContain('Training complete');
    mode.update(1, airborne);
    expect(mode.hud.lesson?.number).toBe(6);
  });
});
