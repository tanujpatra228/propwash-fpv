import { Euler, Quaternion, Vector3 } from 'three';
import { GHOST } from '../config';
import { GHOST_CHANNELS, decodeGhost, encodeInts, type GhostData } from '../core/ghost-codec';
import { clamp } from '../core/math';

export type { GhostData };

const CHANNELS = GHOST_CHANNELS;
const euler = new Euler(0, 0, 0, 'YXZ');
const TWO_PI = Math.PI * 2;

function wrapAngle(rad: number): number {
  return rad - TWO_PI * Math.round(rad / TWO_PI);
}

const prevPosition = new Vector3();
const prevQuaternion = new Quaternion();
const tickPosition = new Vector3();
const tickQuaternion = new Quaternion();

/**
 * Records a lap at a fixed rate. Call `record` every frame; ticks that fall between two frames are
 * interpolated, so playback is in sync to the millimetre rather than to the nearest frame.
 */
export class GhostRecorder {
  private readonly ints: number[] = [];
  private lastQuantised = new Array<number>(CHANNELS).fill(0);
  private nextSampleS = 0;
  private count = 0;
  private hasPrevious = false;
  private previousS = 0;
  private readonly previousPosition = new Vector3();
  private readonly previousQuaternion = new Quaternion();

  /** `lapTimeS` counts from the start of the lap. */
  record(lapTimeS: number, position: Vector3, quaternion: Quaternion): void {
    if (lapTimeS > GHOST.maxRecordS) return;
    const interval = 1 / GHOST.hz;
    while (lapTimeS >= this.nextSampleS) {
      if (this.hasPrevious && this.nextSampleS > this.previousS && lapTimeS > this.previousS) {
        const t = (this.nextSampleS - this.previousS) / (lapTimeS - this.previousS);
        prevPosition.copy(this.previousPosition);
        prevQuaternion.copy(this.previousQuaternion);
        tickPosition.lerpVectors(prevPosition, position, t);
        tickQuaternion.slerpQuaternions(prevQuaternion, quaternion, t);
        this.push(tickPosition, tickQuaternion);
      } else {
        this.push(position, quaternion);
      }
      this.nextSampleS += interval;
    }
    this.previousS = lapTimeS;
    this.previousPosition.copy(position);
    this.previousQuaternion.copy(quaternion);
    this.hasPrevious = true;
  }

  private push(position: Vector3, quaternion: Quaternion): void {
    euler.setFromQuaternion(quaternion, 'YXZ');
    const q = [
      Math.round(position.x / GHOST.positionStepM),
      Math.round(position.y / GHOST.positionStepM),
      Math.round(position.z / GHOST.positionStepM),
      Math.round(euler.y / GHOST.angleStepRad),
      Math.round(euler.x / GHOST.angleStepRad),
      Math.round(euler.z / GHOST.angleStepRad),
    ];
    const wrapAt = Math.round(TWO_PI / GHOST.angleStepRad);
    for (let c = 0; c < CHANNELS; c++) {
      let delta = (q[c] ?? 0) - (this.lastQuantised[c] ?? 0);
      // Yaw jumps by a full turn when it wraps; store the short way round.
      if (c === 3) delta -= wrapAt * Math.round(delta / wrapAt);
      this.ints.push(delta);
    }
    this.lastQuantised = q;
    this.count++;
  }

  get sampleCount(): number {
    return this.count;
  }

  finish(): GhostData {
    return { hz: GHOST.hz, data: encodeInts(this.ints) };
  }
}

/** A lap ready for playback: absolute positions and angles, interpolated between samples. */
export class GhostTrack {
  private readonly samples: Float64Array;
  readonly durationS: number;
  private readonly hz: number;

  private constructor(samples: Float64Array, hz: number) {
    this.samples = samples;
    this.hz = hz;
    this.durationS = Math.max(0, (samples.length / CHANNELS - 1) / hz);
  }

  /** Returns null for data that does not decode cleanly. */
  static fromData(data: GhostData): GhostTrack | null {
    const decoded = decodeGhost(data);
    return decoded ? new GhostTrack(decoded.samples, decoded.hz) : null;
  }

  /** Pose at `lapTimeS`, or false once the lap is over. Allocation-free. */
  sample(lapTimeS: number, outPosition: Vector3, outQuaternion: Quaternion): boolean {
    if (lapTimeS < 0 || lapTimeS > this.durationS) return false;
    const f = clamp(lapTimeS * this.hz, 0, this.samples.length / CHANNELS - 1);
    const i = Math.floor(f);
    const t = f - i;
    const a = i * CHANNELS;
    const b = Math.min(a + CHANNELS, this.samples.length - CHANNELS);
    const s = this.samples;
    const lerp = (c: number): number => (s[a + c] ?? 0) + ((s[b + c] ?? 0) - (s[a + c] ?? 0)) * t;
    outPosition.set(lerp(0), lerp(1), lerp(2));
    const yawA = s[a + 3] ?? 0;
    const yawDelta = wrapAngle((s[b + 3] ?? 0) - yawA);
    euler.set(lerp(4), yawA + yawDelta * t, lerp(5), 'YXZ');
    outQuaternion.setFromEuler(euler);
    return true;
  }
}
