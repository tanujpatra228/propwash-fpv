import { Euler, Quaternion, type Scene } from 'three';
import { ROOMS } from '../config';
import type { PoseFields, RosterEntry } from '../core/room-protocol';
import { createDroneModel, type DroneModel } from '../drone/drone-model';
import { SnapshotBuffer, type RemotePose } from '../net/snapshot-buffer';
import type { PilotMarker } from './modes/mode';

const euler = new Euler(0, 0, 0, 'YXZ');
const PROP_THROTTLE = 0.5;

interface Remote {
  model: DroneModel;
  buffer: SnapshotBuffer;
  marker: PilotMarker;
}

/** The other pilots' drones in a live race: created from the roster, moved from smoothed network poses. */
export class RemoteDrones {
  private readonly remotes = new Map<string, Remote>();
  private readonly sampled: RemotePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  private readonly quaternion = new Quaternion();
  /** Pilots currently drawn, rebuilt every `update`. Read by the HUD for the on-screen pins and the minimap. */
  readonly visible: PilotMarker[] = [];

  constructor(private readonly scene: Scene) {}

  /** Makes sure there is a drone for every other pilot in the roster and none for pilots who left. */
  setRoster(roster: readonly RosterEntry[], myId: string): void {
    const wanted = new Set(roster.filter((p) => p.id !== myId).map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!wanted.has(id)) this.remove(id);
    for (const pilot of roster) {
      if (pilot.id === myId || this.remotes.has(pilot.id)) continue;
      const color = ROOMS.droneColors[pilot.slot % ROOMS.droneColors.length] ?? 0xffffff;
      const model = createDroneModel({ color });
      model.group.visible = false;
      this.scene.add(model.group);
      this.remotes.set(pilot.id, { model, buffer: new SnapshotBuffer(), marker: { id: pilot.id, name: pilot.name, color, x: 0, y: 0, z: 0 } });
    }
  }

  push(id: string, pose: PoseFields, nowMs: number): void {
    this.remotes.get(id)?.buffer.push(nowMs, {
      x: pose.x / 100, y: pose.y / 100, z: pose.z / 100,
      yaw: pose.yaw / 100, pitch: pose.pitch / 100, roll: pose.roll / 100,
    });
  }

  update(nowMs: number, dtS: number): void {
    const s = this.sampled;
    this.visible.length = 0;
    for (const { model, buffer, marker } of this.remotes.values()) {
      const isShown = buffer.sample(nowMs, s);
      model.group.visible = isShown;
      if (!isShown) continue;
      marker.x = s.x;
      marker.y = s.y;
      marker.z = s.z;
      this.visible.push(marker);
      model.group.position.set(s.x, s.y, s.z);
      euler.set(s.pitch, s.yaw, s.roll, 'YXZ');
      model.group.quaternion.copy(this.quaternion.setFromEuler(euler));
      model.spinProps(PROP_THROTTLE, dtS);
    }
  }

  /** Forgets old poses so a new race starts clean, and hides everything. */
  reset(): void {
    this.visible.length = 0;
    for (const { model, buffer } of this.remotes.values()) {
      buffer.clear();
      model.group.visible = false;
    }
  }

  clear(): void {
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }

  private remove(id: string): void {
    const remote = this.remotes.get(id);
    if (!remote) return;
    this.scene.remove(remote.model.group);
    remote.model.dispose();
    this.remotes.delete(id);
  }
}
