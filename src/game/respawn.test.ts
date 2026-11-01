import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGatePlane } from '../world/gate-crossing';
import type { Gate } from '../world/gates';
import { respawnPose, type Pose } from './respawn';

const gate = (index: number, x: number, z: number, fx: number, fz: number): Gate => ({
  index,
  ...createGatePlane(new Vector3(x, 6, z), new Vector3(fx, 0, fz)),
});
const gates = [gate(0, 0, 0, 0, -1), gate(1, 0, -50, 0, -1), gate(2, 50, -100, 1, 0)];
const start: Pose = { position: new Vector3(9, 1, 9), yawRad: 0.5 };
const out = (): Pose => ({ position: new Vector3(), yawRad: 0 });

describe('respawnPose', () => {
  it('uses the start pose before any gate is passed', () => {
    const pose = respawnPose(gates, -1, start, () => 0, out());
    expect(pose.position.toArray()).toEqual([9, 1, 9]);
    expect(pose.yawRad).toBe(0.5);
  });

  it('places the drone just past the last gate, facing the next gate', () => {
    const pose = respawnPose(gates, 0, start, () => 0, out());
    expect(pose.position.x).toBeCloseTo(0);
    expect(pose.position.z).toBeCloseTo(-2);
    expect(pose.position.y).toBe(6);
    expect(pose.yawRad).toBeCloseTo(0); // gate 1 is straight ahead (-Z)
  });

  it('turns toward the next gate when the course bends', () => {
    const pose = respawnPose(gates, 1, start, () => 0, out());
    // From (0, -52) toward gate 2 at (50, -100): to the right (+X) and ahead (-Z).
    expect(pose.yawRad).toBeLessThan(0);
    expect(pose.yawRad).toBeGreaterThan(-Math.PI / 2);
  });

  it('wraps from the last gate to gate 0', () => {
    const pose = respawnPose(gates, 2, start, () => 0, out());
    expect(Number.isFinite(pose.yawRad)).toBe(true);
  });

  it('never spawns inside the ground', () => {
    const pose = respawnPose(gates, 0, start, () => 20, out());
    expect(pose.position.y).toBeGreaterThanOrEqual(20.3);
  });
});
