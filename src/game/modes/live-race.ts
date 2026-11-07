import { Euler, Quaternion, Vector3 } from 'three';
import { ROOMS, TRACK, TRIAL } from '../../config';
import { formatLapTime } from '../../core/format';
import type { PoseFields, ResultRow, RosterEntry, StandingEntry } from '../../core/room-protocol';
import { ordinal, type StandingRow } from '../../ui/standings-panel';
import { gridPose } from '../grid';
import { respawnPose, type Pose } from '../respawn';
import type { GameMode, ModeFrame, ModeHost, ModeHud, RaceHud } from './mode';

/** What the live race needs from the room connection. The real one is the room client; tests use a fake. */
export interface LiveSession {
  readonly myId: string;
  /** Starting-grid slot, 0 to 7. */
  readonly mySlot: number;
  readonly isHost: boolean;
  readonly totalLaps: number;
  readonly roster: readonly RosterEntry[];
  /** Race order as last reported by the server, with each pilot's gates passed. */
  readonly order: readonly StandingEntry[];
  sendGate(index: number): void;
  sendPose(pose: PoseFields & { dNextM: number }): void;
  requestRematch(): void;
}

type State = 'countdown' | 'running' | 'over';

const HINT = 'Fly all 12 gates in order, every lap. Crash or reset and you restart at the last gate.';
const euler = new Euler(0, 0, 0, 'YXZ');
const cm = (m: number): number => Math.round(m * 100);
const rad100 = (r: number): number => Math.round(r * 100);

/** A race against friends. The server decides who finished where; this mode flies, reports gates and shows the order. */
export class LiveRace implements GameMode {
  readonly id = 'live' as const;
  readonly drainsBattery = false;
  readonly race: RaceHud = { lap: 1, lapTimeS: 0, lastLapS: null, bestLapS: null, splitDeltaS: null };
  readonly hud: ModeHud = { modeLabel: 'Live race', hint: HINT, race: this.race, countdown: '', swapProgress01: 0, lesson: null, standings: [], ghostLabel: '' };
  private state: State = 'countdown';
  private countdownLeftS: number = ROOMS.countdownMs / 1000;
  private goShownLeftS = 0;
  private timeS = 0;
  private poseTimerS = 0;
  private myPlace = 0;
  private readonly finished = new Map<string, number>();
  private readonly poseSource = new Quaternion();

  constructor(
    private readonly host: ModeHost,
    private readonly session: LiveSession,
  ) {}

  get isInputLocked(): boolean {
    return this.state === 'countdown';
  }

  ghostPose(_p: Vector3, _q: Quaternion): boolean {
    return false;
  }

  start(): void {
    this.host.tracker.reset();
    this.host.tracker.best = null;
    this.host.battery.refill();
    this.host.hideBanner();
    this.state = 'countdown';
    this.countdownLeftS = ROOMS.countdownMs / 1000;
    this.goShownLeftS = 0;
    this.timeS = 0;
    this.poseTimerS = 0;
    this.myPlace = 0;
    this.finished.clear();
    Object.assign(this.race, { lap: 1, lapTimeS: 0, lastLapS: null, bestLapS: null, splitDeltaS: null });
    this.host.placeDrone(this.startPose());
    this.refreshHud();
  }

  private startPose(): Pose {
    const gate = this.host.gates[0];
    return gate ? gridPose(gate, this.session.mySlot, { position: new Vector3(), yawRad: 0 }) : this.host.padPose;
  }

  /** The server restarted the countdown clock (for example a late `countdown` message). */
  onCountdown(startsInMs: number): void {
    this.countdownLeftS = startsInMs / 1000;
  }

  /** The server says GO: this is the moment input unlocks, so everyone starts together. */
  onGo(): void {
    if (this.state !== 'countdown') return;
    this.state = 'running';
    this.goShownLeftS = TRIAL.goShownS;
    this.timeS = 0;
  }

  onFinish(id: string, place: number): void {
    this.finished.set(id, place);
    if (id === this.session.myId) {
      this.myPlace = place;
      this.host.flashBanner(`${ordinal(place)} place`, 'You finished. Keep flying while the others finish.', 'info', 4);
    } else if (this.myPlace === 0) {
      const name = this.session.roster.find((p) => p.id === id)?.name ?? 'A pilot';
      this.host.flashBanner(`${name} finished ${ordinal(place)}`, '', 'info', 2.5);
    }
  }

  onResults(rows: readonly ResultRow[]): void {
    this.state = 'over';
    const lines = rows.map((r) => (r.place > 0 ? `${ordinal(r.place)}  ${r.name}  ${formatLapTime(r.timeS)}` : `DNF  ${r.name}`));
    const wait = this.session.isHost ? '' : '\n\nThe host can start a rematch.';
    this.host.offerNextSteps('Race results', lines.join('\n') + wait, [
      ...(this.session.isHost ? [{ id: 'restart' as const, label: 'Rematch', isPrimary: true }] : []),
      { id: 'menu' as const, label: 'Leave room', isPrimary: !this.session.isHost },
    ]);
    this.hud.hint = 'Race over.';
  }

  update(dtS: number, _frame: ModeFrame): void {
    if (this.state === 'countdown') {
      this.countdownLeftS = Math.max(0, this.countdownLeftS - dtS);
      this.hud.countdown = String(Math.max(1, Math.ceil(this.countdownLeftS)));
    } else {
      this.goShownLeftS = Math.max(0, this.goShownLeftS - dtS);
      this.hud.countdown = this.goShownLeftS > 0 ? 'GO' : '';
      this.timeS += dtS;
      this.race.lapTimeS = this.host.tracker.currentLapTimeS(this.timeS);
    }
    this.poseTimerS += dtS;
    if (this.poseTimerS >= 1 / ROOMS.poseHz) {
      this.poseTimerS = 0;
      this.sendPose();
    }
    this.refreshHud();
  }

  private sendPose(): void {
    const { position, quaternion } = this.host.flight;
    this.poseSource.copy(quaternion);
    euler.setFromQuaternion(this.poseSource, 'YXZ');
    const next = this.host.gates[this.host.tracker.nextGate];
    this.session.sendPose({
      x: cm(position.x),
      y: cm(position.y),
      z: cm(position.z),
      yaw: rad100(euler.y),
      pitch: rad100(euler.x),
      roll: rad100(euler.z),
      dNextM: next ? Math.min(100_000, Math.round(position.distanceTo(next.position))) : 0,
    });
  }

  private refreshHud(): void {
    const names = new Map(this.session.roster.map((p) => [p.id, p.name]));
    const lapOf = Math.min(this.session.totalLaps, this.host.tracker.completedLaps + 1);
    this.race.lap = lapOf;
    this.hud.modeLabel = `Live race · lap ${lapOf} of ${this.session.totalLaps}`;
    this.hud.standings = this.session.order.flatMap((entry): StandingRow[] => {
      const name = names.get(entry.id);
      if (name === undefined) return [];
      const lap = Math.min(this.session.totalLaps, Math.floor(Math.max(0, entry.gates - 1) / TRACK.gateCount) + 1);
      return [{ name, isMe: entry.id === this.session.myId, finishedPlace: this.finished.get(entry.id) ?? 0, lap }];
    });
  }

  onGateCrossed(index: number): void {
    if (this.state !== 'running' || this.myPlace > 0) return;
    const event = this.host.tracker.onGateCrossed(index, this.timeS);
    if (!event) return;
    this.session.sendGate(index);
    if (event.type === 'lap') {
      this.race.lastLapS = event.lapTimeS;
      this.race.bestLapS = Math.min(this.race.bestLapS ?? Infinity, event.lapTimeS);
    }
  }

  respawnPose(out: Pose): Pose {
    return respawnPose(this.host.gates, this.host.tracker.respawnGate, this.startPose(), this.host.groundY, out);
  }

  handleReset(): boolean {
    if (this.state === 'over') {
      if (this.session.isHost) this.session.requestRematch();
      return true;
    }
    return this.state === 'countdown';
  }
}
