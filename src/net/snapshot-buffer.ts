/**
 * Smooths another pilot's drone. Poses arrive about 10 times a second; the drone is drawn a little in the past
 * (`delayMs`) so there are usually two poses to blend between. If updates are late it keeps moving for a short
 * while, then holds, and after a long silence it reports nothing so the drone can fade out.
 */
import { ROOMS } from '../config';

export interface RemotePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

const CAPACITY = 16;
const TWO_PI = Math.PI * 2;

function lerpAngle(from: number, to: number, t: number): number {
  const diff = to - from - TWO_PI * Math.round((to - from) / TWO_PI);
  return from + diff * t;
}

interface Snapshot extends RemotePose {
  atMs: number;
}

export class SnapshotBuffer {
  private readonly items: Snapshot[] = [];

  /** `atMs` is when the pose arrived, on the same clock later passed to `sample`. */
  push(atMs: number, pose: RemotePose): void {
    const last = this.items[this.items.length - 1];
    if (last && atMs <= last.atMs) return;
    this.items.push({ atMs, ...pose });
    if (this.items.length > CAPACITY) this.items.shift();
  }

  clear(): void {
    this.items.length = 0;
  }

  get lastArrivalMs(): number {
    return this.items[this.items.length - 1]?.atMs ?? -Infinity;
  }

  /** The pose to draw at `nowMs`, written into `out`. Returns false when there is nothing to show. */
  sample(nowMs: number, out: RemotePose): boolean {
    const n = this.items.length;
    const last = this.items[n - 1];
    if (!last || nowMs - last.atMs > ROOMS.silentFadeMs) return false;
    const renderMs = nowMs - ROOMS.interpolationDelayMs;
    const first = this.items[0];
    if (first && renderMs <= first.atMs) return Object.assign(out, pick(first)), true;
    for (let i = n - 1; i > 0; i--) {
      const b = this.items[i];
      const a = this.items[i - 1];
      if (!a || !b || renderMs > b.atMs || renderMs < a.atMs) continue;
      blend(a, b, (renderMs - a.atMs) / (b.atMs - a.atMs), out);
      return true;
    }
    // Past the newest pose: carry on along the last velocity for a moment, then hold.
    const prev = this.items[n - 2];
    Object.assign(out, pick(last));
    if (prev) {
      const over = Math.min(renderMs - last.atMs, ROOMS.maxExtrapolationMs);
      const rate = over / (last.atMs - prev.atMs);
      out.x += (last.x - prev.x) * rate;
      out.y += (last.y - prev.y) * rate;
      out.z += (last.z - prev.z) * rate;
    }
    return true;
  }
}

function pick(s: RemotePose): RemotePose {
  return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, roll: s.roll };
}

function blend(a: RemotePose, b: RemotePose, t: number, out: RemotePose): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.yaw = lerpAngle(a.yaw, b.yaw, t);
  out.pitch = lerpAngle(a.pitch, b.pitch, t);
  out.roll = lerpAngle(a.roll, b.roll, t);
}
