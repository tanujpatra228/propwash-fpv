import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ROOMS } from '../config';
import type { RosterEntry } from '../core/room-protocol';
import { RemoteDrones } from './remote-drones';

const roster: RosterEntry[] = [
  { id: 'me', name: 'Arjun', isReady: true, slot: 0, isConnected: true },
  { id: 'bea', name: 'Bea', isReady: true, slot: 1, isConnected: true },
  { id: 'cy', name: 'Cy', isReady: true, slot: 2, isConnected: true },
];
const pose = (x: number) => ({ x, y: 500, z: -200, yaw: 0, pitch: 0, roll: 0 });

describe('RemoteDrones markers', () => {
  it('lists only other pilots that have sent poses, in their slot colour', () => {
    const drones = new RemoteDrones(new Scene());
    drones.setRoster(roster, 'me');
    drones.push('bea', pose(1000), 1000);
    drones.update(1000 + ROOMS.interpolationDelayMs, 0.016);
    expect(drones.visible.map((m) => m.name)).toEqual(['Bea']);
    expect(drones.visible[0]).toMatchObject({ x: 10, y: 5, z: -2, color: ROOMS.droneColors[1] });
  });
  it('never includes yourself and drops pilots who left or fell silent', () => {
    const drones = new RemoteDrones(new Scene());
    drones.setRoster(roster, 'me');
    drones.push('bea', pose(0), 1000);
    drones.push('cy', pose(0), 1000);
    drones.update(1200, 0.016);
    expect(drones.visible).toHaveLength(2);
    drones.setRoster(roster.filter((p) => p.id !== 'cy'), 'me');
    drones.update(1300, 0.016);
    expect(drones.visible.map((m) => m.id)).toEqual(['bea']);
    drones.update(1000 + ROOMS.silentFadeMs + 100, 0.016);
    expect(drones.visible).toHaveLength(0);
  });
  it('reset hides everyone until new poses arrive', () => {
    const drones = new RemoteDrones(new Scene());
    drones.setRoster(roster, 'me');
    drones.push('bea', pose(0), 1000);
    drones.update(1200, 0.016);
    drones.reset();
    expect(drones.visible).toHaveLength(0);
    drones.update(1300, 0.016);
    expect(drones.visible).toHaveLength(0);
  });
});
