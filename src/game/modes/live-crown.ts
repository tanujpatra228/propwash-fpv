import { Vector3, type Quaternion } from 'three';
import { ACTIVE_TRACK_ID, CROWN, ROOMS, TRACK_DEFS, TRIAL } from '../../config';
import type { PoseFields, ResultRow, RoomRules, RosterEntry, ServerMessage } from '../../core/room-protocol';
import { ordinal, type StandingRow } from '../../ui/standings-panel';
import { gridPose } from '../grid';
import type { Pose } from '../respawn';
import type { GameMode, ModeAudio, ModeFrame, ModeHost, ModeHud, PilotMarker } from './mode';
import { quantisePose } from './pose-report';

export type CrownUpdate = Extract<ServerMessage, { t: 'crown' }>;

/** What crown chase needs from the room connection. The real one is the live controller; tests use a fake. */
export interface CrownSession {
  readonly myId: string;
  readonly mySlot: number;
  readonly isHost: boolean;
  readonly roster: readonly RosterEntry[];
  readonly rules: RoomRules;
  readonly others: readonly PilotMarker[];
  /** The latest crown state from the server. */
  readonly crown: CrownUpdate;
  sendPose(pose: PoseFields & { dNextM: number }): void;
  requestRematch(): void;
}

type State = 'countdown' | 'running' | 'over';

const FREE_HINT = 'Fly to the gold beacon to claim the crown.';
const HOLD_S = CROWN.holdMaxMs / 1000;

function seconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Dethrone: fly where you like, take the crown from the king by staying close, score for every second you hold it. */
export class LiveCrown implements GameMode {
  readonly id = 'crown' as const;
  readonly drainsBattery = false;
  /** What the sound needs: refreshed every frame. */
  readonly audio: ModeAudio = { myId: '', holderId: '', holdLeftMs: 0, threatId: '', threat01: 0, beacon: null, isRunning: false };
  readonly hud: ModeHud = { modeLabel: 'Crown chase', hint: FREE_HINT, race: null, countdown: '', swapProgress01: 0, lesson: null, standings: [], others: [], ghostLabel: '' };
  private state: State = 'countdown';
  private countdownLeftS: number = ROOMS.countdownMs / 1000;
  private goShownLeftS = 0;
  private poseTimerS = 0;
  private lastHolder = '';
  private hasSeenCrown = false;
  /** The crown on the minimap and as a name tag while it lies free at its point. */
  private readonly crownMarker: PilotMarker = { id: 'crown', name: 'Crown', color: 0xffc83a, isKing: true, x: 0, y: 0, z: 0 };
  private readonly pose: PoseFields = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };

  constructor(
    private readonly host: ModeHost,
    private readonly session: CrownSession,
  ) {}

  /** Hangar setups when the host chose them; the battery never drains in crown chase. */
  get usesSetup(): boolean {
    return this.session.rules.loadout === 'hangar';
  }

  get isInputLocked(): boolean {
    return this.state === 'countdown';
  }

  ghostPose(_p: Vector3, _q: Quaternion): boolean {
    return false;
  }

  start(): void {
    this.host.battery.refill();
    this.host.hideBanner();
    this.state = 'countdown';
    this.countdownLeftS = ROOMS.countdownMs / 1000;
    this.goShownLeftS = 0;
    this.poseTimerS = 0;
    this.lastHolder = '';
    this.hasSeenCrown = false;
    const [cx, cy, cz] = TRACK_DEFS[ACTIVE_TRACK_ID].crownSpawn;
    this.crownMarker.x = cx;
    this.crownMarker.y = cy;
    this.crownMarker.z = cz;
    this.host.placeDrone(this.startPose());
    this.refreshHud();
  }

  private startPose(): Pose {
    const gate = this.host.gates[0];
    return gate ? gridPose(gate, this.session.mySlot, { position: new Vector3(), yawRad: 0 }) : this.host.padPose;
  }

  onCountdown(startsInMs: number): void {
    this.countdownLeftS = startsInMs / 1000;
  }

  onGo(): void {
    if (this.state !== 'countdown') return;
    this.state = 'running';
    this.goShownLeftS = TRIAL.goShownS;
  }

  /** A crown update from the server. Flashes a banner when the crown is claimed, changes hands or drops. */
  onCrown(update: CrownUpdate): void {
    if (this.state === 'over') return;
    const holder = update.holderId;
    if (this.hasSeenCrown && holder !== this.lastHolder) {
      const name = this.session.roster.find((p) => p.id === holder)?.name ?? 'A pilot';
      if (holder === this.session.myId) this.host.flashBanner('You have the crown', `Hold it up to ${HOLD_S} seconds. Safe for ${CROWN.protectMs / 1000}.`, 'info', 3);
      else if (holder === '') {
        const wasMine = this.lastHolder === this.session.myId;
        this.host.flashBanner(wasMine ? 'Time is up' : 'The crown dropped', `Back at the beacon in ${seconds(update.respawnLeftMs)} seconds.`, wasMine ? 'crash' : 'info', 3);
      } else if (this.lastHolder === this.session.myId) this.host.flashBanner('Dethroned', `${name} took the crown. Chase them down.`, 'crash', 3);
      else this.host.flashBanner(`${name} took the crown`, '', 'info', 2);
    }
    this.hasSeenCrown = true;
    this.lastHolder = holder;
  }

  onResults(rows: readonly ResultRow[]): void {
    this.state = 'over';
    const lines = rows.map((r) => `${ordinal(r.place)}  ${r.name}  ${r.score.toFixed(0)} s on the crown`);
    const wait = this.session.isHost ? '' : '\n\nThe host can start a rematch.';
    this.host.offerNextSteps('Crown chase results', lines.join('\n') + wait, [
      ...(this.session.isHost ? [{ id: 'restart' as const, label: 'Rematch', isPrimary: true }] : []),
      { id: 'menu' as const, label: 'Leave room', isPrimary: !this.session.isHost },
    ]);
    this.hud.hint = 'Match over.';
  }

  update(dtS: number, _frame: ModeFrame): void {
    if (this.state === 'countdown') {
      this.countdownLeftS = Math.max(0, this.countdownLeftS - dtS);
      this.hud.countdown = String(Math.max(1, Math.ceil(this.countdownLeftS)));
    } else {
      this.goShownLeftS = Math.max(0, this.goShownLeftS - dtS);
      this.hud.countdown = this.goShownLeftS > 0 ? 'GO' : '';
    }
    this.poseTimerS += dtS;
    if (this.poseTimerS >= 1 / ROOMS.poseHz) {
      this.poseTimerS = 0;
      const { position, quaternion } = this.host.flight;
      quantisePose(position, quaternion, this.pose);
      this.session.sendPose({ ...this.pose, dNextM: 0 });
    }
    this.refreshHud();
  }

  private refreshHud(): void {
    const { crown, myId, roster } = this.session;
    const names = new Map(roster.map((p) => [p.id, p.name]));
    const isCrownFree = crown.holderId === '' && crown.respawnLeftMs <= 0 && crown.remainingMs > 0;
    this.hud.others = isCrownFree ? [...this.session.others, this.crownMarker] : this.session.others;
    this.hud.modeLabel = this.state === 'over' ? 'Crown chase' : `Crown chase · ${clock(crown.remainingMs)} left`;
    this.hud.standings = crown.scores.flatMap((s): StandingRow[] => {
      const name = names.get(s.id);
      if (name === undefined) return [];
      return [{ name: s.id === crown.holderId ? `♛ ${name}` : name, isMe: s.id === myId, finishedPlace: 0, lap: 0, detail: `${Math.floor(s.points)} s` }];
    });
    const a = this.audio;
    a.myId = myId;
    a.holderId = crown.holderId;
    a.holdLeftMs = crown.holdLeftMs;
    a.threatId = crown.threatId;
    a.threat01 = crown.threat01;
    a.beacon = isCrownFree ? this.crownMarker : null;
    a.isRunning = this.state === 'running';
    if (this.state === 'over') return;
    this.hud.hint = this.hint();
  }

  private hint(): string {
    const { crown, myId } = this.session;
    const isClose = crown.threat01 > 0.25;
    if (crown.holderId === '') return crown.respawnLeftMs > 0 ? `The crown returns in ${seconds(crown.respawnLeftMs)}. Get to the beacon.` : FREE_HINT;
    if (crown.holderId === myId) return isClose ? 'A chaser is close! Get away!' : `You are the king: ${seconds(crown.holdLeftMs)} s left on the crown.`;
    if (crown.threatId === myId && isClose) return 'Close! Touch the king!';
    return `Take the crown from the king. It drops in ${seconds(crown.holdLeftMs)} s.`;
  }

  onGateCrossed(_index: number): void {
    // No gates in this mode.
  }

  respawnPose(out: Pose): Pose {
    const start = this.startPose();
    out.position.copy(start.position);
    out.yawRad = start.yawRad;
    return out;
  }

  handleReset(): boolean {
    if (this.state === 'over') {
      if (this.session.isHost) this.session.requestRematch();
      return true;
    }
    return this.state === 'countdown';
  }
}
