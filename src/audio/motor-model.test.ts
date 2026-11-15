import { describe, expect, it } from 'vitest';
import { AUDIO, CROWN } from '../config';
import { batteryBeepIntervalS, beaconCue, cameraMix, heartbeatIntervalS, pulseIntervalS, crashIntensity, crashProfile, crashVolume, gatePitchHz, motorLoads, motorVoiceTone, washLevel, windTone, type MotorState } from './motor-model';

const level: MotorState = { throttle01: 0.5, pitchRad: 0, rollRad: 0, pitchRateRadps: 0, rollRateRadps: 0, yawRateRadps: 0 };

describe('motorLoads', () => {
  it('shares the throttle evenly when level', () => {
    expect(motorLoads(level)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
  it('loads the rear motors when the nose is down, the front when it is up', () => {
    const [fl, fr, bl, br] = motorLoads({ ...level, pitchRad: -0.5 });
    expect(bl).toBeGreaterThan(fl);
    expect(br).toBeGreaterThan(fr);
    const up = motorLoads({ ...level, pitchRad: 0.5 });
    expect(up[0]).toBeGreaterThan(up[2]);
  });
  it('loads the left motors when banked right (right side down) and the right ones when banked left', () => {
    const [fl, fr, bl, br] = motorLoads({ ...level, rollRad: -0.5 });
    expect(fl).toBeGreaterThan(fr);
    expect(bl).toBeGreaterThan(br);
    const left = motorLoads({ ...level, rollRad: 0.5 });
    expect(left[1]).toBeGreaterThan(left[0]);
  });
  it('loads one diagonal pair when turning, the other when turning the other way', () => {
    const [fl, fr, bl, br] = motorLoads({ ...level, yawRateRadps: 3 });
    expect(fl).toBeGreaterThan(fr);
    expect(br).toBeGreaterThan(bl);
    const back = motorLoads({ ...level, yawRateRadps: -3 });
    expect(back[1]).toBeGreaterThan(back[0]);
  });
  it('responds to tilt rate too, and stays within 0..1', () => {
    const quick = motorLoads({ ...level, pitchRateRadps: -4 });
    expect(quick[2]).toBeGreaterThan(quick[0]);
    for (const load of motorLoads({ ...level, throttle01: 1, pitchRad: -2, rollRad: -2 })) {
      expect(load).toBeGreaterThanOrEqual(0);
      expect(load).toBeLessThanOrEqual(1);
    }
  });
});

describe('washLevel', () => {
  it('is zero in level flight', () => expect(washLevel(0, 0)).toBe(0));
  it('rises with sink rate and is full at the full sink rate', () => {
    expect(washLevel(AUDIO.washSinkStartMps, 0)).toBe(0);
    expect(washLevel(6, 0)).toBeGreaterThan(0);
    expect(washLevel(AUDIO.washSinkFullMps, 0)).toBe(1);
    expect(washLevel(100, 0)).toBe(1);
  });
  it('rises with a throttle punch in either direction, but less than a full dive', () => {
    const punch = washLevel(0, AUDIO.washThrottleRateForFullPerS);
    expect(punch).toBeGreaterThan(0.5);
    expect(punch).toBeLessThan(1);
    expect(washLevel(0, -AUDIO.washThrottleRateForFullPerS)).toBe(punch);
  });
  it('climbing (negative sink) is not wash', () => expect(washLevel(-5, 0)).toBe(0));
});

describe('windTone and motorVoiceTone', () => {
  it('wind is silent when still, louder and brighter with speed, and capped', () => {
    expect(windTone(0).volume).toBe(0);
    expect(windTone(15).volume).toBeCloseTo(0.05);
    expect(windTone(500).volume).toBe(AUDIO.windMaxVolume);
    expect(windTone(20).bandHz).toBeGreaterThan(windTone(5).bandHz);
  });
  it('a motor rises in pitch and brightness with load, and each is detuned from the next', () => {
    expect(motorVoiceTone(1, 1, 0).hz).toBeGreaterThan(motorVoiceTone(0, 1, 0).hz);
    expect(motorVoiceTone(1, 1, 0).cutoffHz).toBeGreaterThan(motorVoiceTone(0, 1, 0).cutoffHz);
    expect(motorVoiceTone(0.5, 0.5, 0).hz).not.toBe(motorVoiceTone(0.5, 0.5, 1).hz);
  });
  it('four motors together stay at the old total volume', () => {
    const total = [0, 1, 2, 3].reduce((sum, i) => sum + motorVoiceTone(1, 1, i).volume, 0);
    expect(total).toBeCloseTo(AUDIO.volumeBase + AUDIO.volumePerThrottle);
  });
});

describe('cameras, gates and the battery', () => {
  it('goggles are louder and brighter than chase, and chase than broadcast', () => {
    expect(cameraMix('goggles').motor).toBeGreaterThan(cameraMix('chase').motor);
    expect(cameraMix('chase').motor).toBeGreaterThan(cameraMix('broadcast').motor);
    expect(cameraMix('goggles').brightness).toBeGreaterThan(cameraMix('chase').brightness);
  });
  it('gate pitch rises a semitone per gate in a row, up to an octave', () => {
    expect(gatePitchHz(0)).toBe(AUDIO.gate.baseHz);
    expect(gatePitchHz(1) / gatePitchHz(0)).toBeCloseTo(2 ** (1 / 12));
    expect(gatePitchHz(12)).toBeCloseTo(AUDIO.gate.baseHz * 2);
    expect(gatePitchHz(40)).toBeCloseTo(AUDIO.gate.baseHz * 2);
    expect(gatePitchHz(-3)).toBe(AUDIO.gate.baseHz);
  });
  it('low-battery beeps come slowly at the threshold and quickly near empty', () => {
    expect(batteryBeepIntervalS(0.2, 0.2)).toBeCloseTo(AUDIO.batteryBeep.slowIntervalS);
    expect(batteryBeepIntervalS(0, 0.2)).toBeCloseTo(AUDIO.batteryBeep.fastIntervalS);
    expect(batteryBeepIntervalS(0.1, 0.2)).toBeLessThan(batteryBeepIntervalS(0.15, 0.2));
    expect(batteryBeepIntervalS(0.9, 0.2)).toBeCloseTo(AUDIO.batteryBeep.slowIntervalS);
  });
});

describe('crash sounds', () => {
  it('a slow bump is quiet but never silent, a hard crash is full', () => {
    expect(crashIntensity(0)).toBe(0);
    expect(crashIntensity(AUDIO.crash.fullSpeedMps)).toBe(1);
    expect(crashIntensity(500)).toBe(1);
    expect(crashVolume(0)).toBe(AUDIO.crash.minVolume);
    expect(crashVolume(AUDIO.crash.fullSpeedMps)).toBe(1);
    expect(crashVolume(14)).toBeGreaterThan(crashVolume(6));
  });
  it('every surface has a usable profile', () => {
    for (const profile of Object.values(AUDIO.crash.profiles)) {
      expect(profile.thumpHz).toBeGreaterThan(0);
      expect(profile.noiseS).toBeGreaterThan(0);
      expect(profile.ringsHz.length === 0 || profile.ringS > 0).toBe(true);
    }
  });
  it('metal rings and soft things do not: containers, gates and cranes ring, ground, trees and buildings thud', () => {
    for (const metal of ['container', 'gate', 'crane'] as const) expect(crashProfile(metal).ringsHz.length).toBeGreaterThan(0);
    for (const soft of ['ground', 'tree', 'building', 'factory'] as const) expect(crashProfile(soft).ringsHz).toHaveLength(0);
  });
  it('buildings thud lower than rocks, and water glides down', () => {
    expect(crashProfile('building').thumpHz).toBeLessThan(crashProfile('rock').thumpHz);
    expect(crashProfile('water').noiseGlideToHz).toBeLessThan(crashProfile('water').noiseHz);
  });
});

describe('crown cues', () => {
  const at = { x: 0, y: 10, z: 0 };
  it('the beacon is silent beyond its range and loudest on top of you', () => {
    expect(beaconCue(at, 0, { x: AUDIO.crown.beacon.rangeM + 10, y: 10, z: 0 }).loudness01).toBe(0);
    expect(beaconCue(at, 0, { x: 0, y: 10, z: 0 }).loudness01).toBe(1);
    expect(beaconCue(at, 0, { x: 50, y: 10, z: 0 }).loudness01).toBeGreaterThan(beaconCue(at, 0, { x: 120, y: 10, z: 0 }).loudness01);
  });
  it('pans to the side the beacon is on, relative to where the drone faces', () => {
    // Facing -z (yaw 0): +x is right, -x is left, ahead and behind are centred.
    expect(beaconCue(at, 0, { x: 50, y: 10, z: 0 }).pan).toBeCloseTo(1);
    expect(beaconCue(at, 0, { x: -50, y: 10, z: 0 }).pan).toBeCloseTo(-1);
    expect(beaconCue(at, 0, { x: 0, y: 10, z: -50 }).pan).toBeCloseTo(0);
    // Turned left by 90 degrees (yaw +90): now facing -x, so +x is behind and -z is on the right.
    expect(beaconCue(at, Math.PI / 2, { x: 0, y: 10, z: -50 }).pan).toBeCloseTo(1);
    expect(beaconCue(at, 0, at).pan).toBe(0);
  });
  it('the heartbeat speeds up as the hold runs out, and accelerates near the end', () => {
    expect(heartbeatIntervalS(CROWN.holdMaxMs)).toBeCloseTo(AUDIO.crown.heartbeat.slowIntervalS);
    expect(heartbeatIntervalS(0)).toBeCloseTo(AUDIO.crown.heartbeat.fastIntervalS);
    const early = heartbeatIntervalS(25_000) - heartbeatIntervalS(20_000);
    const late = heartbeatIntervalS(10_000) - heartbeatIntervalS(5000);
    expect(late).toBeGreaterThan(early);
  });
  it('the pulse starts only when a chaser is close and speeds up as they near touching', () => {
    expect(pulseIntervalS(0.1)).toBe(0);
    expect(pulseIntervalS(AUDIO.crown.pulse.startThreat01)).toBeCloseTo(AUDIO.crown.pulse.slowIntervalS);
    expect(pulseIntervalS(1)).toBeCloseTo(AUDIO.crown.pulse.fastIntervalS);
    expect(pulseIntervalS(0.7)).toBeLessThan(pulseIntervalS(0.4));
  });
});
