import { Quaternion, Vector3 } from 'three';
import { TRIAL } from '../../config';
import { formatLapTime } from '../../core/format';
import { GhostRecorder, GhostTrack } from '../../drone/ghost';
import type { GateEvent } from '../lap-tracker';
import { respawnPose, type Pose } from '../respawn';
import { loadBestLap, saveBestLap, toTrackerBest, type SavedBestLap } from '../trial-storage';
import type { GameMode, ModeFrame, ModeHost, ModeHud, RaceHud } from './mode';

type State = 'countdown' | 'running' | 'finished';

const HINT_RUNNING = 'Fly all 12 gates in order. Crash or reset and you restart at the last gate; the clock keeps running.';

/** One battery per run: fly laps against the clock and your best-lap ghost. */
export class TimeTrial implements GameMode {
  readonly id = 'trial' as const;
  readonly drainsBattery = true;
  readonly race: RaceHud = { lap: 1, lapTimeS: 0, lastLapS: null, bestLapS: null, splitDeltaS: null };
  readonly hud: ModeHud = { modeLabel: 'Time trial', hint: HINT_RUNNING, race: this.race, countdown: '', swapProgress01: 0, lesson: null };
  private state: State = 'countdown';
  private countdownLeftS: number = TRIAL.countdownS;
  private goShownLeftS = 0;
  private timeS = 0;
  private splitShownLeftS = 0;
  private emptyForS = 0;
  private recorder: GhostRecorder | null = null;
  private ghost: GhostTrack | null = null;
  private saved: SavedBestLap | null = null;

  constructor(private readonly host: ModeHost) {}

  get isInputLocked(): boolean {
    return this.state !== 'running';
  }

  get isFinished(): boolean {
    return this.state === 'finished';
  }

  start(): void {
    this.saved = loadBestLap();
    this.ghost = this.saved ? GhostTrack.fromData(this.saved.ghost) : null;
    if (this.saved && !this.ghost) this.saved = null; // corrupt ghost: treat as no best lap
    this.host.tracker.reset();
    this.host.tracker.best = this.saved ? toTrackerBest(this.saved) : null;
    this.host.battery.refill();
    this.host.hideBanner();
    this.state = 'countdown';
    this.countdownLeftS = TRIAL.countdownS;
    this.goShownLeftS = 0;
    this.timeS = 0;
    this.emptyForS = 0;
    this.recorder = null;
    this.race.lap = 1;
    this.race.lapTimeS = 0;
    this.race.lastLapS = null;
    this.race.bestLapS = this.saved?.lapTimeS ?? null;
    this.race.splitDeltaS = null;
    this.host.placeDrone(this.startPose({ position: new Vector3(), yawRad: 0 }));
    this.updateCountdownText();
  }

  /** 4 m behind gate 0, facing it, at gate height. */
  private startPose(out: Pose): Pose {
    const gate = this.host.gates[0];
    if (!gate) return this.host.padPose;
    out.position.copy(gate.position).addScaledVector(gate.forward, -TRIAL.startBehindGateM);
    out.yawRad = Math.atan2(-gate.forward.x, -gate.forward.z);
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
    if (this.state === 'finished') return;

    this.timeS += dtS;
    this.splitShownLeftS = Math.max(0, this.splitShownLeftS - dtS);
    if (this.splitShownLeftS === 0) this.race.splitDeltaS = null;
    this.race.lapTimeS = this.host.tracker.currentLapTimeS(this.timeS);
    if (this.recorder) this.recorder.record(this.race.lapTimeS, this.host.flight.position, this.host.flight.quaternion);

    if (this.host.battery.isEmpty) {
      this.emptyForS += dtS;
      if (frame.isLanded || this.emptyForS >= TRIAL.emptyBatteryGraceS) this.finishRun();
    }
  }

  private updateCountdownText(): void {
    if (this.state === 'countdown') this.hud.countdown = String(Math.max(1, Math.ceil(this.countdownLeftS)));
    else this.hud.countdown = this.goShownLeftS > 0 ? 'GO' : '';
  }

  private finishRun(): void {
    this.state = 'finished';
    const laps = this.host.tracker.completedLaps;
    const best = this.host.tracker.best;
    const bestText = best ? `best ${formatLapTime(best.lapTimeS)}` : 'no lap completed';
    this.host.offerNextSteps('Battery empty', `${laps} ${laps === 1 ? 'lap' : 'laps'} · ${bestText}`, [
      { id: 'restart', label: 'New run', isPrimary: true },
      { id: 'menu', label: 'Back to menu' },
    ]);
    this.hud.hint = 'Run over. Start a new run for a fresh battery.';
  }

  onGateCrossed(index: number): void {
    if (this.state !== 'running') return;
    const event = this.host.tracker.onGateCrossed(index, this.timeS);
    if (event) this.handleEvent(event);
  }

  private handleEvent(event: GateEvent): void {
    if (event.type === 'start') {
      this.recorder = new GhostRecorder();
      return;
    }
    if (event.type === 'gate') {
      if (event.deltaToBestS !== null) {
        this.race.splitDeltaS = event.deltaToBestS;
        this.splitShownLeftS = TRIAL.splitShownS;
      }
      return;
    }
    // A lap just finished.
    this.race.lastLapS = event.lapTimeS;
    this.race.lap = this.host.tracker.completedLaps + 1;
    const ghostData = this.recorder?.finish() ?? null;
    this.recorder = new GhostRecorder();
    if (event.isBest && ghostData) {
      this.race.bestLapS = event.lapTimeS;
      this.saved = { lapTimeS: event.lapTimeS, splitsS: event.splitsS, ghost: ghostData };
      this.ghost = GhostTrack.fromData(ghostData);
      const isSaved = saveBestLap(this.saved);
      this.host.flashBanner('New best lap', `${formatLapTime(event.lapTimeS)}${isSaved ? '' : ' (not saved: browser storage is blocked)'}`, 'info', TRIAL.bannerShownS);
    }
  }

  ghostPose(outPosition: Vector3, outQuaternion: Quaternion): boolean {
    if (this.state !== 'running' || !this.ghost || !this.host.tracker.hasStarted) return false;
    return this.ghost.sample(this.host.tracker.currentLapTimeS(this.timeS), outPosition, outQuaternion);
  }

  respawnPose(out: Pose): Pose {
    const start = this.startPose({ position: new Vector3(), yawRad: 0 });
    return respawnPose(this.host.gates, this.host.tracker.respawnGate, start, this.host.groundY, out);
  }

  handleReset(): boolean {
    if (this.state === 'finished') {
      this.start();
      return true;
    }
    return this.state === 'countdown'; // ignore reset during the countdown
  }
}
