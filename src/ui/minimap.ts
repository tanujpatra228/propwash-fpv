import { VALLEY } from '../config';
import { el } from '../core/dom';
import { track } from '../world/track';
import type { HudState } from './hud-state';

const SIZE_PX = 340;
const PADDING_PX = 26;
const EXTRA_WORLD_M = 40;
const TRACK_STEP = 20;

/** Round minimap. The track, lake and factory are drawn once; only the drone arrow and other pilots' dots are redrawn. */
export class Minimap {
  private readonly canvas = el('canvas', { class: 'minimap', width: String(SIZE_PX), height: String(SIZE_PX), 'aria-label': 'Minimap' });
  private readonly context: CanvasRenderingContext2D | null = this.canvas.getContext('2d');
  private readonly background = document.createElement('canvas');
  private readonly centerX: number;
  private readonly centerZ: number;
  private readonly pixelsPerM: number;

  constructor(parent: HTMLElement) {
    parent.append(this.canvas);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of track.positions) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    this.centerX = (minX + maxX) / 2;
    this.centerZ = (minZ + maxZ) / 2;
    this.pixelsPerM = (SIZE_PX / 2 - PADDING_PX) / (Math.max(maxX - minX, maxZ - minZ) / 2 + EXTRA_WORLD_M);
    this.background.width = SIZE_PX;
    this.background.height = SIZE_PX;
    this.drawBackground();
  }

  private toMap(x: number, z: number): [number, number] {
    return [SIZE_PX / 2 + (x - this.centerX) * this.pixelsPerM, SIZE_PX / 2 + (z - this.centerZ) * this.pixelsPerM];
  }

  private drawBackground(): void {
    const c = this.background.getContext('2d');
    if (!c) return;
    c.beginPath();
    for (let i = 0; i <= track.sampleCount; i += TRACK_STEP) {
      const p = track.positions[i % track.sampleCount];
      if (!p) continue;
      const [x, y] = this.toMap(p.x, p.z);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.strokeStyle = 'rgba(255,255,255,.18)';
    c.lineWidth = 7;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)';
    c.lineWidth = 3;
    c.stroke();
    const [lx, ly] = this.toMap(VALLEY.lake.x, VALLEY.lake.z);
    c.fillStyle = 'rgba(70,150,190,.45)';
    c.beginPath();
    c.arc(lx, ly, VALLEY.lake.radiusM * this.pixelsPerM, 0, Math.PI * 2);
    c.fill();
    const [bx, by] = this.toMap(VALLEY.bando.x, VALLEY.bando.z);
    c.fillStyle = 'rgba(200,190,170,.45)';
    c.fillRect(bx - 7, by - 7, 14, 14);
    const start = track.positions[0];
    if (start) {
      const [sx, sy] = this.toMap(start.x, start.z);
      c.fillStyle = '#fff';
      c.fillRect(sx - 5, sy - 5, 10, 10);
    }
  }

  update(state: HudState): void {
    const c = this.context;
    if (!c) return;
    c.clearRect(0, 0, SIZE_PX, SIZE_PX);
    c.save();
    c.beginPath();
    c.arc(SIZE_PX / 2, SIZE_PX / 2, SIZE_PX / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.drawImage(this.background, 0, 0);
    for (const other of state.others) {
      const [ox, oy] = this.toMap(other.x, other.z);
      c.beginPath();
      c.arc(ox, oy, 7, 0, Math.PI * 2);
      c.fillStyle = `#${other.color.toString(16).padStart(6, '0')}`;
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = '#000';
      c.stroke();
    }
    const [x, y] = this.toMap(state.map.x, state.map.z);
    // Heading: forward is -Z at yaw 0, and the map's +Y axis is world +Z.
    const angle = Math.atan2(-Math.cos(state.map.yawRad), -Math.sin(state.map.yawRad));
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = '#ff7a1a';
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(13, 0);
    c.lineTo(-8, 8);
    c.lineTo(-4, 0);
    c.lineTo(-8, -8);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
  }
}
