import { AUDIO, CROWN, type CrashProfile, type CrashSoundId, type SoundCameraId } from '../config';
import { clamp01 } from '../core/math';

/** The drone's attitude and motion as the sound needs it. */
export interface MotorState {
  throttle01: number;
  /** Radians. Negative pitch is nose down, negative roll is the right side down (as the flight model reports them). */
  pitchRad: number;
  rollRad: number;
  /** Radians per second. */
  pitchRateRadps: number;
  rollRateRadps: number;
  yawRateRadps: number;
}

/** Load 0..1 of the four motors: front left, front right, rear left, rear right. */
export type MotorLoads = readonly [number, number, number, number];

/**
 * How hard each motor works. All share the throttle. Nose down loads the rear pair, a bank loads the side that has to
 * lift, and turning loads one diagonal pair (the way a quad yaws). Tilt gives a steady offset, its rate of change the
 * quick correction a flight controller makes.
 */
export function motorLoads(s: MotorState): MotorLoads {
  const pitch = -(s.pitchRad * AUDIO.loadPerTiltRad + s.pitchRateRadps * AUDIO.loadPerTiltRateRadps); // nose down: positive, rear works harder
  const roll = -(s.rollRad * AUDIO.loadPerTiltRad + s.rollRateRadps * AUDIO.loadPerTiltRateRadps); // right side down: positive, left works harder
  const yaw = s.yawRateRadps * AUDIO.loadPerYawRateRadps;
  const t = clamp01(s.throttle01);
  return [
    clamp01(t - pitch + roll + yaw),
    clamp01(t - pitch - roll - yaw),
    clamp01(t + pitch + roll - yaw),
    clamp01(t + pitch - roll + yaw),
  ];
}

/** 0 when flying level, up to 1 when sinking fast through your own wash or punching the throttle. */
export function washLevel(sinkRateMps: number, throttleRatePerS: number): number {
  const sink = clamp01((sinkRateMps - AUDIO.washSinkStartMps) / (AUDIO.washSinkFullMps - AUDIO.washSinkStartMps));
  const punch = clamp01(Math.abs(throttleRatePerS) / AUDIO.washThrottleRateForFullPerS);
  return clamp01(Math.max(sink, punch * 0.8));
}

export interface WindTone {
  bandHz: number;
  volume: number;
}

/** Wind rushing past: louder and brighter with speed. */
export function windTone(speedMps: number): WindTone {
  const speed = Math.max(0, speedMps);
  return {
    bandHz: AUDIO.windBandHz + AUDIO.windBandHzPerMps * speed,
    volume: Math.min(AUDIO.windMaxVolume, (speed / AUDIO.windSpeedForFullMps) * AUDIO.windVolumeAtFull),
  };
}

/** One motor's pitch, brightness and loudness for its load. `index` picks its detune. */
export function motorVoiceTone(load01: number, throttle01: number, index: number): { hz: number; cutoffHz: number; volume: number } {
  const detune = AUDIO.motorDetune[index] ?? 0;
  const t = clamp01(throttle01);
  return {
    hz: (AUDIO.motorBaseHz + AUDIO.motorHzPerThrottle * clamp01(load01)) * (1 + detune),
    cutoffHz: AUDIO.cutoffBaseHz + AUDIO.cutoffHzPerThrottle * clamp01(load01),
    // The four motors share the total volume.
    volume: (AUDIO.volumeBase + AUDIO.volumePerThrottle * t) / AUDIO.motorDetune.length,
  };
}

/** What a camera hears. */
export function cameraMix(camera: SoundCameraId): { motor: number; brightness: number; wind: number } {
  return AUDIO.cameraMix[camera];
}

/** Pitch of the nth gate in a row: one semitone higher each time, up to an octave. */
export function gatePitchHz(streak: number): number {
  const steps = Math.max(0, Math.min(AUDIO.gate.maxSemitones, Math.floor(streak)));
  return AUDIO.gate.baseHz * 2 ** (steps / 12);
}

/** Seconds between low-battery beeps: slow at the low threshold, fast near empty. `charge01` is the charge left. */
export function batteryBeepIntervalS(charge01: number, lowThreshold01: number): number {
  const urgency = clamp01(1 - charge01 / Math.max(1e-6, lowThreshold01));
  return AUDIO.batteryBeep.slowIntervalS + (AUDIO.batteryBeep.fastIntervalS - AUDIO.batteryBeep.slowIntervalS) * urgency;
}

/** How hard a crash sounds, 0..1, from the impact speed. */
export function crashIntensity(speedMps: number): number {
  const { minSpeedMps, fullSpeedMps } = AUDIO.crash;
  return clamp01((speedMps - minSpeedMps) / (fullSpeedMps - minSpeedMps));
}

/** Volume multiplier for a crash: never silent (a bump still thuds), full for a hard crash. */
export function crashVolume(speedMps: number): number {
  return AUDIO.crash.minVolume + (1 - AUDIO.crash.minVolume) * crashIntensity(speedMps);
}

export function crashProfile(reason: CrashSoundId): CrashProfile {
  return AUDIO.crash.profiles[reason];
}

/** The free crown as the pilot hears it: how loud (0..1) and which side (-1 left, 1 right). */
export interface BeaconCue {
  loudness01: number;
  pan: number;
}

/**
 * Where the beacon is from the pilot's ears. `yawRad` is the drone's heading (forward is -z at yaw 0, turning left is
 * positive). Silent beyond the beacon's range, loudest on top of it.
 */
export function beaconCue(listener: { x: number; y: number; z: number }, yawRad: number, beacon: { x: number; y: number; z: number }): BeaconCue {
  const dx = beacon.x - listener.x;
  const dy = beacon.y - listener.y;
  const dz = beacon.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const closeness = clamp01(1 - distance / AUDIO.crown.beacon.rangeM);
  const horizontal = Math.hypot(dx, dz);
  // Right of the drone is (cos yaw, -sin yaw) on the ground plane.
  const pan = horizontal < 1e-6 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(yawRad) - dz * Math.sin(yawRad)) / horizontal));
  return { loudness01: closeness * closeness, pan };
}

/** Seconds between heartbeats while wearing the crown: calm at the start of the hold, racing as it runs out. */
export function heartbeatIntervalS(holdLeftMs: number): number {
  const { slowIntervalS, fastIntervalS } = AUDIO.crown.heartbeat;
  const used = clamp01(1 - holdLeftMs / CROWN.holdMaxMs);
  return slowIntervalS + (fastIntervalS - slowIntervalS) * used * used;
}

/** Seconds between proximity pulses for a chaser at `threat01` (0 far, 1 touching), or 0 when too far for a pulse. */
export function pulseIntervalS(threat01: number): number {
  const { startThreat01, slowIntervalS, fastIntervalS } = AUDIO.crown.pulse;
  if (threat01 < startThreat01) return 0;
  const t = clamp01((threat01 - startThreat01) / (1 - startThreat01));
  return slowIntervalS + (fastIntervalS - slowIntervalS) * t;
}
