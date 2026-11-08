import { Vector3, type Quaternion } from 'three';
import { CHALLENGES, TRACK, TRIAL } from '../../config';
import { formatLapTime } from '../../core/format';
import {
  applyRun,
  enduranceScore,
  findChallenge,
  loadRecords,
  saveRecords,
  starsFor,
  type ChallengeDef,
  type Records,
  type RunResult,
} from '../challenge-results';
import { respawnPose, type Pose } from '../respawn';
import type { GameMode, ModeFrame, ModeHost, ModeHud, RaceHud } from './mode';

type State = 'countdown' | 'running' | 'over';

export interface ChallengeStore {
  load(): Records;
  save(records: Records): void;
}

const STORE: ChallengeStore = { load: loadRecords, save: (r) => void saveRecords(r) };
const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Finish the laps before the one battery runs out. The pilot's Hangar setup applies. */
export class BatteryChallenge implements GameMode {
  readonly id = 'challenge' as const;
  readonly drainsBattery = true;
  readonly usesSetup = true;
  readonly race: RaceHud = { lap: 1, lapTimeS: 0, lastLapS: null, bestLapS: null, splitDeltaS: null };
  readonly hud: ModeHud = { modeLabel: 'Battery Challenge', hint: '', race: this.race, countdown: '', swapProgress01: 0, lesson: null, standings: null, ghostLabel: '' };
  private def: ChallengeDef = findChallenge('three') as ChallengeDef;
  private state: State = 'countdown';
  private countdownLeftS: number = CHALLENGES.countdownS;
  private goShownLeftS = 0;
  private timeS = 0;
  private emptyForS = 0;
  private records: Records;

  constructor(
    private readonly host: ModeHost,
    private readonly store: ChallengeStore = STORE,
  ) {
    this.records = store.load();
  }

  setChallenge(def: ChallengeDef): void {
    this.def = def;
  }

  get challenge(): ChallengeDef {
    return this.def;
  }

  get isInputLocked(): boolean {
    return this.state !== 'running';
  }

  ghostPose(_p: Vector3, _q: Quaternion): boolean {
    return false;
  }

  start(): void {
    this.records = this.store.load();
    this.host.tracker.reset();
    this.host.tracker.best = null;
    this.host.battery.refill();
    this.host.hideBanner();
    this.state = 'countdown';
    this.countdownLeftS = CHALLENGES.countdownS;
    this.goShownLeftS = 0;
    this.timeS = 0;
    this.emptyForS = 0;
    Object.assign(this.race, { lap: 1, lapTimeS: 0, lastLapS: null, bestLapS: null, splitDeltaS: null });
    this.hud.modeLabel = `Challenge: ${this.def.name}`;
    this.hud.hint = this.def.blurb;
    this.host.placeDrone(this.startPose());
    this.updateCountdownText();
  }

  private startPose(): Pose {
    const gate = this.host.gates[0];
    if (!gate) return this.host.padPose;
    const out: Pose = { position: new Vector3(), yawRad: Math.atan2(-gate.forward.x, -gate.forward.z) };
    out.position.copy(gate.position).addScaledVector(gate.forward, -TRIAL.startBehindGateM);
    return out;
  }

  update(dtS: number, frame: ModeFrame): void {
    if (this.state === 'countdown') {
      this.countdownLeftS -= dtS;
      if (this.countdownLeftS <= 0) {
        this.state = 'running';
        this.goShownLeftS = TRIAL.goShownS;
      }
      this.updateCountdownText();
      return;
    }
    this.goShownLeftS = Math.max(0, this.goShownLeftS - dtS);
    this.updateCountdownText();
    if (this.state === 'over') return;
    this.timeS += dtS;
    this.race.lapTimeS = this.host.tracker.currentLapTimeS(this.timeS);
    if (this.host.battery.isEmpty) {
      this.emptyForS += dtS;
      if (frame.isLanded || this.emptyForS >= CHALLENGES.emptyBatteryGraceS) this.finish(false);
    }
  }

  private updateCountdownText(): void {
    if (this.state === 'countdown') this.hud.countdown = String(Math.max(1, Math.ceil(this.countdownLeftS)));
    else this.hud.countdown = this.goShownLeftS > 0 ? 'GO' : '';
  }

  onGateCrossed(index: number): void {
    if (this.state !== 'running') return;
    const event = this.host.tracker.onGateCrossed(index, this.timeS);
    if (event?.type !== 'lap') return;
    this.host.earn('lap');
    this.race.lastLapS = event.lapTimeS;
    this.race.bestLapS = Math.min(this.race.bestLapS ?? Infinity, event.lapTimeS);
    this.race.lap = this.host.tracker.completedLaps + 1;
    if (this.def.laps !== null && this.host.tracker.completedLaps >= this.def.laps) this.finish(true);
  }

  private finish(isFinished: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over';
    const { tracker, battery } = this.host;
    const run: RunResult = { isFinished, charge01: battery.charge01, timeS: this.timeS };
    const gatesInLap = tracker.hasStarted ? tracker.nextGate : 0;
    const score = this.def.laps === null ? enduranceScore(tracker.completedLaps, gatesInLap, TRACK.gateCount) : null;
    const outcome = applyRun(this.records, this.def, run, score);
    this.store.save(this.records);
    const credits = this.host.earn('star', outcome.newStars);
    this.host.offerNextSteps(this.title(isFinished), this.summary(run, score, outcome.newStars, credits), [
      { id: 'restart', label: 'Try again', isPrimary: true },
      { id: 'menu', label: 'Back to menu' },
    ]);
    this.hud.hint = 'Run over.';
  }

  private title(isFinished: boolean): string {
    if (this.def.laps === null) return 'Battery empty';
    return isFinished ? 'Challenge complete' : `Out of battery on lap ${this.host.tracker.completedLaps + 1}`;
  }

  private summary(run: RunResult, score: number | null, newStars: number, credits: number): string {
    const lines: string[] = [];
    if (score !== null) lines.push(`${score.toFixed(2)} laps`);
    else lines.push(`${stars(starsFor(this.def, run))}  ${run.isFinished ? formatLapTime(run.timeS) : 'did not finish'}`);
    if (run.isFinished) lines.push(`${Math.round(run.charge01 * 100)}% battery left`);
    if (credits > 0) lines.push(`+${credits} credits for ${newStars} new ${newStars === 1 ? 'star' : 'stars'}`);
    return lines.join('\n');
  }

  respawnPose(out: Pose): Pose {
    return respawnPose(this.host.gates, this.host.tracker.respawnGate, this.startPose(), this.host.groundY, out);
  }

  handleReset(): boolean {
    if (this.state === 'over') {
      this.start();
      return true;
    }
    return this.state === 'countdown';
  }
}
