import { Quaternion, Vector3 } from 'three';
import { MENU } from '../config';
import { track } from '../world/track';

export interface RacerConfig {
  topSpeedMps: number;
  lateralOffsetM: number;
  /** Offsets the gentle speed and line wobble so racers do not move in lockstep. */
  phase: number;
  startDistM: number;
}

const WOBBLE_SPEED_PER_S = 0.23;
const WOBBLE_SPEED_FRACTION = 0.025;
const WOBBLE_LINE_PER_S = 0.31;
const WOBBLE_LINE_M = 0.6;
const POSE_SMOOTHING_PER_S = 9;

const wantedPosition = new Vector3();
const wantedQuaternion = new Quaternion();

/** An AI drone that flies the racing line, slowing for tight bends. Used behind the menu (and later for ghosts and opponents). */
export class TrackRacer {
  distM: number;
  speedMps = 0;
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  private hasPose = false;

  constructor(private readonly config: RacerConfig) {
    this.distM = config.startDistM;
  }

  step(dtS: number, timeS: number): void {
    const { config } = this;
    const bendAhead = track.curvatureMagnitudeAtDistance(this.distM + this.speedMps * MENU.lookAheadS);
    const wobble = 1 + WOBBLE_SPEED_FRACTION * Math.sin(timeS * WOBBLE_SPEED_PER_S + config.phase);
    const bendLimit = Math.sqrt(MENU.maxLateralAccelMps2 / Math.max(bendAhead, 1e-4));
    const target = Math.min(config.topSpeedMps * wobble, bendLimit);
    const rate = target > this.speedMps ? MENU.speedUpPerS : MENU.slowDownPerS;
    this.speedMps += (target - this.speedMps) * Math.min(1, dtS * rate);
    this.distM = (this.distM + this.speedMps * dtS) % track.lengthM;

    const lateral = config.lateralOffsetM + Math.sin(timeS * WOBBLE_LINE_PER_S + config.phase) * WOBBLE_LINE_M;
    track.poseAt(this.distM, lateral, this.speedMps, wantedPosition, wantedQuaternion);
    this.position.copy(wantedPosition);
    if (this.hasPose) this.quaternion.slerp(wantedQuaternion, 1 - Math.exp(-dtS * POSE_SMOOTHING_PER_S));
    else this.quaternion.copy(wantedQuaternion);
    this.hasPose = true;
  }
}
