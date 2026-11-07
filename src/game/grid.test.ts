import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GATE, ROOMS } from '../config';
import type { Gate } from '../world/gates';
import { gridPose } from './grid';
import type { Pose } from './respawn';

const gate = { index: 0, position: new Vector3(10, 5, -20), forward: new Vector3(0, 0, 1) } as unknown as Gate;
const pose = (slot: number): Pose => gridPose(gate, slot, { position: new Vector3(), yawRad: 0 });

describe('gridPose', () => {
  it('gives every slot a different spot', () => {
    const spots = new Set(Array.from({ length: ROOMS.maxPilots }, (_, s) => pose(s).position.toArray().join(',')));
    expect(spots.size).toBe(ROOMS.maxPilots);
  });
  it('keeps both columns inside the gate opening and behind the gate', () => {
    for (let s = 0; s < ROOMS.maxPilots; s++) {
      const p = pose(s).position;
      expect(Math.abs(p.x - gate.position.x)).toBeLessThan(GATE.widthM / 2);
      expect(p.z).toBeLessThan(gate.position.z);
    }
  });
  it('puts later rows further back and faces the gate', () => {
    expect(pose(4).position.z).toBeLessThan(pose(0).position.z);
    const yaw = pose(0).yawRad;
    expect(Math.sin(yaw)).toBeCloseTo(0);
  });
});
