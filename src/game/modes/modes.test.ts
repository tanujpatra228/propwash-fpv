import { Quaternion, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK, TRIAL } from '../../config';
import { Battery } from '../../drone/battery';
import { STOCK_STATS } from '../../drone/drone-stats';
import { FlightModel } from '../../drone/flight-model';
import { createGatePlane } from '../../world/gate-crossing';
import type { Gate } from '../../world/gates';
import { LapTracker } from '../lap-tracker';
import type { Pose } from '../respawn';
import { FreeFlight } from './free-flight';
import type { ModeHost } from './mode';
import { TimeTrial } from './time-trial';

const gates: Gate[] = Array.from({ length: TRACK.gateCount }, (_, i) => ({
  index: i,
  ...createGatePlane(new Vector3(0, 6, -50 * i), new Vector3(0, 0, -1)),
}));

function makeHost() {
  const flight = new FlightModel();
  const battery = new Battery(STOCK_STATS);
  const tracker = new LapTracker(TRACK.gateCount);
  const pad: Pose = { position: new Vector3(14, 0, 30), yawRad: 0.3 };
  const placed: Pose[] = [];
  const banners: string[] = [];
  const host: ModeHost = {
    flight,
    battery,
    tracker,
    gates,
    padPose: pad,
    groundY: () => 0,
    placeDrone: (pose) => {
      placed.push({ position: pose.position.clone(), yawRad: pose.yawRad });
      flight.reset(pose.position, pose.yawRad);
    },
    flashBanner: (title) => void banners.push(title),
    hideBanner: () => undefined,
  };
  return { host, flight, battery, tracker, placed, banners };
}

const airborne = { isLanded: false };
const landed = { isLanded: true };

/** Runs the mode forward `seconds` at 60 fps. */
function run(mode: { update(dt: number, f: { isLanded: boolean }): void }, seconds: number, frame = airborne): void {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) mode.update(1 / 60, frame);
}

/** Flies gates 0..11 then 0 again, `secondsPerGate` apart. Returns nothing; read the mode afterwards. */
function flyLap(mode: TimeTrial, secondsPerGate: number, startWithGateZero = true): void {
  if (startWithGateZero) mode.onGateCrossed(0);
  for (let i = 1; i < TRACK.gateCount; i++) {
    run(mode, secondsPerGate);
    mode.onGateCrossed(i);
  }
  run(mode, secondsPerGate);
  mode.onGateCrossed(0);
}

describe('TimeTrial', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => void vi.unstubAllGlobals());

  it('locks input and counts down 3, 2, 1, GO before the run starts', () => {
    const { host, placed } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    expect(trial.isInputLocked).toBe(true);
    expect(trial.hud.countdown).toBe('3');
    run(trial, 1.1);
    expect(trial.hud.countdown).toBe('2');
    run(trial, 1);
    expect(trial.hud.countdown).toBe('1');
    run(trial, TRIAL.countdownS - 2.1 + 0.1);
    expect(trial.isInputLocked).toBe(false);
    expect(trial.hud.countdown).toBe('GO');
    run(trial, 1);
    expect(trial.hud.countdown).toBe('');
    // Starts 4 m behind gate 0 facing it.
    const start = placed[0];
    expect(start?.position.z).toBeCloseTo(4);
    expect(start?.yawRad).toBeCloseTo(0);
  });

  it('starts the clock at gate 0, completes a lap at gate 0 again and saves the best', () => {
    const { host, banners, tracker } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    flyLap(trial, 3);
    expect(tracker.completedLaps).toBe(1);
    expect(trial.race.lastLapS).toBeCloseTo(36, 0);
    expect(trial.race.lap).toBe(2);
    expect(banners).toContain('New best lap');
    expect([...store.keys()].some((k) => k.startsWith('pw.trial.valley-sprint'))).toBe(true);
  });

  it('ignores gates passed out of order or before the start', () => {
    const { host, tracker } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    trial.onGateCrossed(4);
    expect(tracker.hasStarted).toBe(false);
    trial.onGateCrossed(0);
    trial.onGateCrossed(3);
    expect(tracker.nextGate).toBe(1);
  });

  it('keeps a faster best lap and does not replace it with a slower one', () => {
    const { host, tracker } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    flyLap(trial, 3); // 36 s
    flyLap(trial, 4, false); // 48 s: slower
    expect(tracker.best?.lapTimeS).toBeCloseTo(36, 0);
    expect(trial.race.bestLapS).toBeCloseTo(36, 0);
    flyLap(trial, 2, false); // 24 s: faster
    expect(tracker.best?.lapTimeS).toBeCloseTo(24, 0);
  });

  it('loads the saved best lap and ghost on the next run, and shows split gaps', () => {
    const first = makeHost();
    const trialA = new TimeTrial(first.host);
    trialA.start();
    run(trialA, 3.1);
    // Fly a lap while moving the drone so the ghost has something to record.
    first.flight.position.set(0, 6, 4);
    first.flight.velocity.set(0, 0, -20);
    trialA.onGateCrossed(0);
    for (let i = 1; i <= TRACK.gateCount; i++) {
      for (let f = 0; f < 180; f++) {
        first.flight.position.z -= 20 / 60;
        trialA.update(1 / 60, airborne);
      }
      trialA.onGateCrossed(i % TRACK.gateCount);
    }
    const second = makeHost();
    const trialB = new TimeTrial(second.host);
    trialB.start();
    expect(second.tracker.best?.lapTimeS).toBeGreaterThan(30);
    expect(trialB.race.bestLapS).toBeCloseTo(second.tracker.best?.lapTimeS ?? 0, 3);
    run(trialB, 3.1);
    trialB.onGateCrossed(0);
    run(trialB, 2);
    trialB.onGateCrossed(1);
    expect(trialB.race.splitDeltaS).not.toBeNull();
    expect(trialB.race.splitDeltaS).toBeLessThan(0); // 2 s into the lap is faster than the saved 3 s split
    expect(trialB.ghostPose(new Vector3(), new Quaternion())).toBe(true);
  });

  it('ignores corrupt saved data', () => {
    store.set('pw.trial.valley-sprint.w1.v1', '{"lapTimeS":40,"splitsS":[1],"ghost":{"hz":20,"data":"x"}}');
    const { host, tracker } = makeHost();
    new TimeTrial(host).start();
    expect(tracker.best).toBeNull();
  });

  it('ends the run when the battery is empty and the drone touches down, then restarts on reset', () => {
    const { host, battery, banners, tracker } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    trial.onGateCrossed(0);
    battery.charge01 = 0;
    run(trial, 0.5, airborne);
    expect(trial.isFinished).toBe(false);
    run(trial, 0.1, landed);
    expect(trial.isFinished).toBe(true);
    expect(trial.isInputLocked).toBe(true);
    expect(banners).toContain('Battery empty');
    expect(trial.handleReset()).toBe(true);
    expect(battery.charge01).toBe(1);
    expect(trial.isFinished).toBe(false);
    expect(tracker.hasStarted).toBe(false);
  });

  it('ends the run after the grace period even if the drone never lands', () => {
    const { host, battery } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    battery.charge01 = 0;
    run(trial, TRIAL.emptyBatteryGraceS + 0.2, airborne);
    expect(trial.isFinished).toBe(true);
  });

  it('respawns at the start before any gate and at the last passed gate afterwards', () => {
    const { host } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    run(trial, 3.1);
    const out: Pose = { position: new Vector3(), yawRad: 0 };
    expect(trial.respawnPose(out).position.z).toBeCloseTo(4);
    trial.onGateCrossed(0);
    trial.onGateCrossed(1);
    trial.onGateCrossed(2);
    trial.respawnPose(out);
    expect(out.position.z).toBeCloseTo(-100 - 2); // just past gate 2
    expect(out.yawRad).toBeCloseTo(0); // gate 3 is straight ahead
  });

  it('does not let the reset key do anything during the countdown', () => {
    const { host } = makeHost();
    const trial = new TimeTrial(host);
    trial.start();
    expect(trial.handleReset()).toBe(true);
    expect(trial.hud.countdown).toBe('3');
  });
});

describe('FreeFlight', () => {
  function setup(drain = true) {
    const ctx = makeHost();
    const mode = new FreeFlight(ctx.host, () => drain);
    mode.start();
    return { ...ctx, mode };
  }

  it('starts on the pad with no countdown and no race panel', () => {
    const { mode, placed, flight } = setup();
    expect(mode.isInputLocked).toBe(false);
    expect(mode.hud.race).toBeNull();
    expect(placed[0]?.position.x).toBe(14);
    expect(flight.position.x).toBe(14);
  });

  it('swaps the battery after 2 s settled on the pad', () => {
    const { mode, battery, banners, flight } = setup();
    battery.charge01 = 0.4;
    flight.position.set(14.5, 0.1, 30);
    flight.velocity.set(0, 0, 0);
    run(mode, 1, landed);
    expect(mode.hud.swapProgress01).toBeGreaterThan(0.3);
    expect(battery.charge01).toBe(0.4);
    run(mode, 1.1, landed);
    expect(battery.charge01).toBe(1);
    expect(banners).toContain('Fresh battery');
  });

  it('does not bother swapping a nearly full battery', () => {
    const { mode, battery, flight, banners } = setup();
    battery.charge01 = 0.99;
    flight.position.set(14, 0.1, 30);
    run(mode, 3, landed);
    expect(battery.charge01).toBe(0.99);
    expect(banners).not.toContain('Fresh battery');
  });

  it('does not swap when off the pad, moving, or airborne', () => {
    const { mode, battery, flight } = setup();
    battery.charge01 = 0.4;
    flight.position.set(20, 0.1, 30); // 6 m from the pad
    run(mode, 3, landed);
    expect(battery.charge01).toBe(0.4);
    flight.position.set(14, 0.1, 30);
    flight.velocity.set(3, 0, 0);
    run(mode, 3, landed);
    expect(battery.charge01).toBe(0.4);
    flight.velocity.set(0, 0, 0);
    run(mode, 3, airborne);
    expect(battery.charge01).toBe(0.4);
  });

  it('sends the drone back to the pad with a fresh battery when it runs empty', () => {
    const { mode, battery, placed, banners } = setup();
    battery.charge01 = 0;
    const before = placed.length;
    run(mode, 0.3, landed);
    expect(battery.charge01).toBe(1);
    expect(placed.length).toBe(before + 1);
    expect(banners).toContain('Battery empty');
  });

  it('respawns on the pad before any gate and at the last gate after', () => {
    const { mode } = setup();
    const out: Pose = { position: new Vector3(), yawRad: 0 };
    expect(mode.respawnPose(out).position.x).toBe(14);
    mode.onGateCrossed(0);
    mode.onGateCrossed(1);
    mode.respawnPose(out);
    expect(out.position.z).toBeCloseTo(-50 - 2);
  });

  it('reports the drain setting', () => {
    expect(setup(true).mode.drainsBattery).toBe(true);
    expect(setup(false).mode.drainsBattery).toBe(false);
  });
});
