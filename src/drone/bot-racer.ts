import { Quaternion, Vector3 } from 'three';
import { BOTS, TRACK, type BotSkillId } from '../config';
import { gridBehindM } from '../core/grid';
import { gateSampleIndex, track } from '../world/track';
import { TrackRacer } from './track-racer';

const GATES = TRACK.gateCount;
/** Each bot is a few percent faster or slower than the skill's top speed, so they spread out. */
const SPEED_SPREAD = [1, 0.97, 1.03, 0.95, 1.02, 0.98];
/** Sideways spread of the racing lines, metres. */
const LINE_SPREAD_M = [-1.2, 1.2, 0, -0.6, 0.6, 0];

export { gridBehindM };

/** Metres along the racing line from gate 0 to each gate (gate 0 is 0). */
function gateOffsetsM(): number[] {
  const start = gateSampleIndex(0) * track.spacingM;
  return Array.from({ length: GATES }, (_, k) => (((gateSampleIndex(k) * track.spacingM - start) % track.lengthM) + track.lengthM) % track.lengthM);
}

/**
 * One AI pilot in a race. The whole race is a pure function of the race clock: the same bot, slot and skill give the
 * same positions and gate times in every browser, because time advances in fixed steps. The drone starts on its grid
 * slot behind the start line, crosses gate 0 to start lap 1 (as humans do), and finishes after the last lap's line.
 */
export class BotRacer {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  private readonly racer: TrackRacer;
  private readonly behindM: number;
  private readonly gateOffsets = gateOffsetsM();
  /** Race time of the latest crossing for each gate crossing so far, in seconds. */
  private readonly crossingTimesS: number[] = [];
  private simTimeS = 0;
  private travelledM = 0;
  private hasPose = false;

  /** `pace` scales the skill's speed (and its cornering by the square): 1 is the skill as listed. */
  constructor(readonly slot: number, skill: BotSkillId, private readonly laps: number, pace = 1) {
    this.behindM = gridBehindM(slot);
    const gate0M = gateSampleIndex(0) * track.spacingM;
    const spec = BOTS.skills[skill];
    this.racer = new TrackRacer({
      topSpeedMps: spec.topSpeedMps * pace * (SPEED_SPREAD[slot % SPEED_SPREAD.length] ?? 1),
      maxLateralAccelMps2: spec.maxLateralAccelMps2 * pace * pace,
      speedUpPerS: spec.speedUpPerS,
      lateralOffsetM: LINE_SPREAD_M[slot % LINE_SPREAD_M.length] ?? 0,
      phase: slot * 1.7,
      startDistM: (((gate0M - this.behindM) % track.lengthM) + track.lengthM) % track.lengthM,
    });
    this.racer.step(0, 0);
    this.copyPose();
  }

  /** Metres travelled from the start when the bot crosses gate crossing number `index` (0 is the start line). */
  crossingM(index: number): number {
    return this.behindM + Math.floor(index / GATES) * track.lengthM + (this.gateOffsets[index % GATES] ?? 0);
  }

  /** Gates passed, counting the start line each time, as a human's count does. */
  get gatesPassed(): number {
    return Math.min(this.crossingTimesS.length, this.totalCrossings);
  }

  private get totalCrossings(): number {
    return this.laps * GATES + 1;
  }

  get isFinished(): boolean {
    return this.crossingTimesS.length >= this.totalCrossings;
  }

  /** Race time in ms of the latest crossing (0 before the first). */
  get lastCrossingMs(): number {
    const last = this.crossingTimesS[this.crossingTimesS.length - 1];
    return last === undefined ? 0 : Math.round(last * 1000);
  }

  /** Metres to the next crossing (0 when finished). */
  get distanceToNextM(): number {
    return this.isFinished ? 0 : Math.max(0, this.crossingM(this.crossingTimesS.length) - this.travelledM);
  }

  get speedMps(): number {
    return this.racer.speedMps;
  }

  /** Runs the simulation up to race time `timeS` in fixed steps (never backwards). A bot that has finished keeps flying on. */
  advanceTo(timeS: number): void {
    while (this.simTimeS + BOTS.stepS <= timeS) {
      const before = this.travelledM;
      this.racer.step(BOTS.stepS, this.simTimeS);
      this.simTimeS += BOTS.stepS;
      this.travelledM += this.racer.speedMps * BOTS.stepS;
      this.recordCrossings(before);
    }
    this.copyPose();
  }

  private recordCrossings(beforeM: number): void {
    const span = this.travelledM - beforeM;
    while (this.crossingTimesS.length < this.totalCrossings) {
      const at = this.crossingM(this.crossingTimesS.length);
      if (at > this.travelledM || span <= 0) break;
      // The moment inside this step the bot passed the line.
      const fraction = Math.max(0, Math.min(1, (at - beforeM) / span));
      this.crossingTimesS.push(this.simTimeS - BOTS.stepS * (1 - fraction));
    }
  }

  private copyPose(): void {
    this.position.copy(this.racer.position);
    this.quaternion.copy(this.racer.quaternion);
    this.hasPose = true;
  }

  get isPlaced(): boolean {
    return this.hasPose;
  }
}
