import { CanvasTexture, Euler, Quaternion, Sprite, SpriteMaterial, SRGBColorSpace, type Scene } from 'three';
import { ROOMS } from '../config';
import type { PoseFields, RosterEntry } from '../core/room-protocol';
import { createDroneModel, type DroneModel } from '../drone/drone-model';
import { SnapshotBuffer, type RemotePose } from '../net/snapshot-buffer';

const euler = new Euler(0, 0, 0, 'YXZ');
const TAG_PX = { w: 256, h: 64 };
const TAG_WORLD = { w: 2.6, h: 0.65 };
const PROP_THROTTLE = 0.5;

interface Remote {
  model: DroneModel;
  tag: Sprite;
  buffer: SnapshotBuffer;
}

function makeTag(name: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_PX.w;
  canvas.height = TAG_PX.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(name, TAG_PX.w / 2, TAG_PX.h / 2, TAG_PX.w - 12);
    ctx.fillText(name, TAG_PX.w / 2, TAG_PX.h / 2, TAG_PX.w - 12);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(TAG_WORLD.w, TAG_WORLD.h, 1);
  return sprite;
}

/** The other pilots' drones in a live race: created from the roster, moved from smoothed network poses. */
export class RemoteDrones {
  private readonly remotes = new Map<string, Remote>();
  private readonly sampled: RemotePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  private readonly quaternion = new Quaternion();

  constructor(private readonly scene: Scene) {}

  /** Makes sure there is a drone for every other pilot in the roster and none for pilots who left. */
  setRoster(roster: readonly RosterEntry[], myId: string): void {
    const wanted = new Set(roster.filter((p) => p.id !== myId).map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!wanted.has(id)) this.remove(id);
    for (const pilot of roster) {
      if (pilot.id === myId || this.remotes.has(pilot.id)) continue;
      const color = ROOMS.droneColors[pilot.slot % ROOMS.droneColors.length] ?? 0xffffff;
      const model = createDroneModel({ color });
      const tag = makeTag(pilot.name);
      model.group.visible = false;
      tag.visible = false;
      this.scene.add(model.group, tag);
      this.remotes.set(pilot.id, { model, tag, buffer: new SnapshotBuffer() });
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
    for (const { model, tag, buffer } of this.remotes.values()) {
      const isShown = buffer.sample(nowMs, s);
      model.group.visible = isShown;
      tag.visible = isShown;
      if (!isShown) continue;
      model.group.position.set(s.x, s.y, s.z);
      euler.set(s.pitch, s.yaw, s.roll, 'YXZ');
      model.group.quaternion.copy(this.quaternion.setFromEuler(euler));
      model.spinProps(PROP_THROTTLE, dtS);
      tag.position.set(s.x, s.y + ROOMS.nameTagHeightM, s.z);
    }
  }

  /** Forgets old poses so a new race starts clean, and hides everything. */
  reset(): void {
    for (const { model, tag, buffer } of this.remotes.values()) {
      buffer.clear();
      model.group.visible = false;
      tag.visible = false;
    }
  }

  clear(): void {
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }

  private remove(id: string): void {
    const remote = this.remotes.get(id);
    if (!remote) return;
    this.scene.remove(remote.model.group, remote.tag);
    remote.model.dispose();
    remote.tag.material.map?.dispose();
    remote.tag.material.dispose();
    this.remotes.delete(id);
  }
}
