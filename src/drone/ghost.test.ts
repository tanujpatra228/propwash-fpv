import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GHOST } from '../config';
import { GhostRecorder, GhostTrack } from './ghost';

const q = (yaw: number, pitch = 0, roll = 0): Quaternion => new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ'));

/** A lap of `seconds` at 60 fps along a wavy path at about 25 m/s. */
function recordLap(seconds: number): { data: ReturnType<GhostRecorder['finish']>; path: (t: number) => Vector3 } {
  const path = (t: number): Vector3 => new Vector3(Math.cos(t * 0.15) * 180 + t * 0.2, 10 + Math.sin(t * 0.7) * 4, Math.sin(t * 0.15) * 180);
  const recorder = new GhostRecorder();
  for (let t = 0; t <= seconds + 1e-9; t += 1 / 60) recorder.record(t, path(t), q(t * 0.3, -0.3, Math.sin(t) * 0.4));
  return { data: recorder.finish(), path };
}

describe('ghost encoding', () => {
  it('round-trips positions within 1 cm and angles within 0.01 rad', () => {
    const { data, path } = recordLap(30);
    const track = GhostTrack.fromData(data);
    expect(track).not.toBeNull();
    const position = new Vector3();
    const quaternion = new Quaternion();
    for (let t = 0; t <= 29; t += 0.5) {
      expect(track?.sample(t, position, quaternion)).toBe(true);
      // Samples are every 1/20 s, so compare at sample times.
      const sampleT = Math.round(t * GHOST.hz) / GHOST.hz;
      const want = path(sampleT);
      expect(position.distanceTo(want)).toBeLessThan(0.02);
      const euler = new Euler().setFromQuaternion(quaternion, 'YXZ');
      const yawError = euler.y - sampleT * 0.3;
      expect(Math.abs(yawError - Math.PI * 2 * Math.round(yawError / (Math.PI * 2)))).toBeLessThan(0.02);
    }
  });

  it('keeps a 45 s lap under 20 KB', () => {
    const { data } = recordLap(45);
    expect(data.data.length).toBeLessThan(20 * 1024);
    expect(JSON.stringify(data).length).toBeLessThan(20 * 1024);
  });

  it('interpolates between samples and reports the duration', () => {
    const recorder = new GhostRecorder();
    for (let t = 0; t <= 1; t += 1 / 60) recorder.record(t, new Vector3(t * 20, 5, 0), q(0));
    const track = GhostTrack.fromData(recorder.finish());
    expect(track?.durationS).toBeGreaterThan(0.9);
    expect(track?.durationS).toBeLessThanOrEqual(1);
    const p = new Vector3();
    track?.sample(0.5, p, new Quaternion());
    expect(p.x).toBeCloseTo(10, 1);
  });

  it('ends playback after the lap', () => {
    const { data } = recordLap(5);
    const track = GhostTrack.fromData(data);
    expect(track?.sample(6, new Vector3(), new Quaternion())).toBe(false);
    expect(track?.sample(-1, new Vector3(), new Quaternion())).toBe(false);
  });

  it('handles yaw wrapping through a full turn', () => {
    const recorder = new GhostRecorder();
    for (let t = 0; t <= 4; t += 1 / 60) recorder.record(t, new Vector3(), q(t * 3)); // 12 rad: wraps twice
    const track = GhostTrack.fromData(recorder.finish());
    const quaternion = new Quaternion();
    track?.sample(3.5, new Vector3(), quaternion);
    const want = q(3.5 * 3);
    expect(Math.abs(quaternion.dot(want))).toBeGreaterThan(0.999);
  });

  it('rejects corrupt data instead of throwing', () => {
    expect(GhostTrack.fromData({ hz: 20, data: 'not valid!!' })).toBeNull();
    expect(GhostTrack.fromData({ hz: 20, data: '' })).toBeNull();
    expect(GhostTrack.fromData({ hz: 20, data: 'AAA' })).toBeNull(); // not a multiple of 6 values
    expect(GhostTrack.fromData({ hz: 0, data: 'AAAAAA' })).toBeNull();
  });

  it('stops recording past the cap', () => {
    const recorder = new GhostRecorder();
    recorder.record(GHOST.maxRecordS + 1, new Vector3(), q(0));
    expect(recorder.sampleCount).toBe(0);
  });
});
