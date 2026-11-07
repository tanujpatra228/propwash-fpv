import { describe, expect, it } from 'vitest';
import { ROOMS } from '../config';
import { SnapshotBuffer, type RemotePose } from './snapshot-buffer';

const pose = (x: number, yaw = 0): RemotePose => ({ x, y: 0, z: 0, yaw, pitch: 0, roll: 0 });
const out = pose(0);
const D = ROOMS.interpolationDelayMs;

describe('SnapshotBuffer', () => {
  it('shows nothing until it has a pose', () => {
    expect(new SnapshotBuffer().sample(1000, out)).toBe(false);
  });
  it('blends between two poses at the delayed time', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(0));
    b.push(1100, pose(10));
    expect(b.sample(1050 + D, out)).toBe(true);
    expect(out.x).toBeCloseTo(5);
  });
  it('holds the oldest pose when asked for a time before it', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(3));
    b.sample(1000, out);
    expect(out.x).toBe(3);
  });
  it('extrapolates briefly, never beyond the limit', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(0));
    b.push(1100, pose(10));
    b.sample(1100 + D + 100, out);
    expect(out.x).toBeCloseTo(20);
    b.sample(1100 + D + 2000, out);
    expect(out.x).toBeCloseTo(10 + (10 * ROOMS.maxExtrapolationMs) / 100);
  });
  it('goes silent after the fade time', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(0));
    expect(b.sample(1000 + ROOMS.silentFadeMs + 1, out)).toBe(false);
  });
  it('turns the short way round when yaw wraps past pi', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(0, 3.0));
    b.push(1100, pose(0, -3.0));
    b.sample(1050 + D, out);
    expect(Math.abs(Math.abs(out.yaw) - Math.PI)).toBeLessThan(0.15);
  });
  it('ignores out-of-order poses and keeps a bounded history', () => {
    const b = new SnapshotBuffer();
    b.push(1000, pose(1));
    b.push(900, pose(99));
    for (let i = 1; i < 100; i++) b.push(1000 + i * 100, pose(i));
    expect(b.lastArrivalMs).toBe(1000 + 99 * 100);
  });
});
