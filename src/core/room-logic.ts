/**
 * The live-race room state machine. Pure: no sockets, no timers, no clock of its own. The server feeds it
 * connections, text frames and the current time; it returns who should be sent what and who to disconnect.
 */
import { ROOMS, TRACK, TRACK_DEFS, TRACK_IDS } from '../config';
import { checkPilotName } from './pilot-name';
import {
  parseClientMessage,
  type ClientMessage,
  type ResultRow,
  type RoomPhase,
  type RosterEntry,
  type ServerMessage,
  type StandingEntry,
} from './room-protocol';

export interface RoomSnapshot {
  code: string;
  worldVersion: number;
  phase: RoomPhase;
  hostId: string;
  laps: number;
  raceStartMs: number;
  firstFinishMs: number;
  finishedCount: number;
  pilots: Pilot[];
}

export const EVERYONE = '*';

export interface Outgoing {
  /** A pilot id, or EVERYONE. */
  to: string;
  message: ServerMessage;
  /** Skip this pilot when `to` is EVERYONE (used to relay a pose back to everyone else). */
  except?: string;
}

export interface Step {
  out: Outgoing[];
  /** Pilot ids whose connection should be closed. */
  close: string[];
}

export interface Pilot {
  id: string;
  name: string;
  isReady: boolean;
  slot: number;
  joinedAtMs: number;
  isConnected: boolean;
  gatesPassed: number;
  lastGateAtMs: number;
  lapStartedAtMs: number;
  bestLapS: number;
  finishTimeS: number;
  place: number;
  dNextM: number;
  lastChatAtMs: number;
  windowStartMs: number;
  windowCount: number;
  badFrames: number;
}

const GATES_PER_LAP = TRACK.gateCount;

function emptyStep(): Step {
  return { out: [], close: [] };
}

export class Room {
  readonly code: string;
  private phase: RoomPhase = 'lobby';
  private hostId = '';
  private laps: number = ROOMS.defaultLaps;
  private readonly pilots = new Map<string, Pilot>();
  private raceStartMs = 0;
  private firstFinishMs = 0;
  private finishedCount = 0;

  constructor(code: string, private readonly worldVersion: number) {
    this.code = code;
  }

  /** Everything needed to rebuild the room after the server's memory was dropped (hibernation). */
  snapshot(): RoomSnapshot {
    return {
      code: this.code, worldVersion: this.worldVersion, phase: this.phase, hostId: this.hostId, laps: this.laps,
      raceStartMs: this.raceStartMs, firstFinishMs: this.firstFinishMs, finishedCount: this.finishedCount,
      pilots: [...this.pilots.values()],
    };
  }

  static restore(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.code, snapshot.worldVersion);
    room.phase = snapshot.phase;
    room.hostId = snapshot.hostId;
    room.laps = snapshot.laps;
    room.raceStartMs = snapshot.raceStartMs;
    room.firstFinishMs = snapshot.firstFinishMs;
    room.finishedCount = snapshot.finishedCount;
    for (const p of snapshot.pilots) room.pilots.set(p.id, { ...p });
    return room;
  }

  getPhase(): RoomPhase {
    return this.phase;
  }

  getHostId(): string {
    return this.hostId;
  }

  pilotCount(): number {
    return this.connected().length;
  }

  private connected(): Pilot[] {
    return [...this.pilots.values()].filter((p) => p.isConnected);
  }

  private roster(): RosterEntry[] {
    return [...this.pilots.values()]
      .sort((a, b) => a.joinedAtMs - b.joinedAtMs)
      .map((p) => ({ id: p.id, name: p.name, isReady: p.isReady, slot: p.slot, isConnected: p.isConnected }));
  }

  private roomMessage(): ServerMessage {
    return { t: 'room', phase: this.phase, hostId: this.hostId, laps: this.laps, pilots: this.roster() };
  }

  private broadcastRoom(step: Step): void {
    step.out.push({ to: EVERYONE, message: this.roomMessage() });
  }

  private freeSlot(): number {
    const used = new Set([...this.pilots.values()].map((p) => p.slot));
    for (let slot = 0; slot < ROOMS.maxPilots; slot++) if (!used.has(slot)) return slot;
    return -1;
  }

  private refuse(id: string, message: string): Step {
    return { out: [{ to: id, message: { t: 'error', message } }], close: [id] };
  }

  /** Says why a client cannot join: it is on another track, or its game is out of date. */
  private versionMessage(clientVersion: number): string {
    const roomTrack = TRACK_IDS.find((t) => TRACK_DEFS[t].worldVersion === this.worldVersion);
    const clientKnown = TRACK_IDS.some((t) => TRACK_DEFS[t].worldVersion === clientVersion);
    if (roomTrack && clientKnown) return `This room races on ${TRACK_DEFS[roomTrack].name}. Switch track in the menu and join again.`;
    return 'Your game version is out of date. Reload the page.';
  }

  /** A pilot connects. A refusal also closes the connection. */
  join(id: string, rawName: unknown, worldVersion: number, nowMs: number): Step {
    if (worldVersion !== this.worldVersion) return this.refuse(id, this.versionMessage(worldVersion));
    const name = checkPilotName(rawName);
    if (!name.ok) return this.refuse(id, name.reason);
    const existing = this.pilots.get(id);
    if (existing?.isConnected) return this.refuse(id, 'You are already in this room in another tab.');
    if (this.phase === 'countdown' || this.phase === 'racing') return this.refuse(id, 'A race is in progress. Join when it ends.');
    if (this.connected().length >= ROOMS.maxPilots) return this.refuse(id, 'This room is full.');
    const slot = existing?.slot ?? this.freeSlot();
    if (slot < 0) return this.refuse(id, 'This room is full.');
    this.pilots.set(id, this.freshPilot(id, name.name, slot, nowMs));
    if (this.hostId === '' || !this.pilots.get(this.hostId)?.isConnected) this.hostId = id;
    const step = emptyStep();
    step.out.push({ to: id, message: { t: 'welcome', you: id, code: this.code } });
    this.broadcastRoom(step);
    return step;
  }

  private freshPilot(id: string, name: string, slot: number, nowMs: number): Pilot {
    return {
      id, name, isReady: false, slot, joinedAtMs: nowMs, isConnected: true, gatesPassed: 0, lastGateAtMs: 0, lapStartedAtMs: 0,
      bestLapS: 0, finishTimeS: 0, place: 0, dNextM: 0, lastChatAtMs: 0, windowStartMs: nowMs, windowCount: 0, badFrames: 0,
    };
  }

  /** A pilot disconnects (closed tab, lost network, or kicked). */
  leave(id: string, nowMs: number): Step {
    const pilot = this.pilots.get(id);
    const step = emptyStep();
    if (!pilot?.isConnected) return step;
    pilot.isConnected = false;
    const racing = this.phase === 'countdown' || this.phase === 'racing';
    if (!racing && this.phase !== 'results') this.pilots.delete(id);
    if (this.connected().length === 0) {
      this.resetToLobby();
      return step;
    }
    if (this.hostId === id) this.hostId = this.longestPresent();
    if (this.phase === 'racing') this.finishIfDone(step);
    this.broadcastRoom(step);
    return step;
  }

  private longestPresent(): string {
    const [first] = this.connected().sort((a, b) => a.joinedAtMs - b.joinedAtMs);
    return first?.id ?? '';
  }

  /** Parses and applies one text frame. Rate limits and counts bad frames. */
  receive(id: string, frame: unknown, nowMs: number): Step {
    const pilot = this.pilots.get(id);
    if (!pilot?.isConnected) return emptyStep();
    if (nowMs - pilot.windowStartMs >= 1000) {
      pilot.windowStartMs = nowMs;
      pilot.windowCount = 0;
    }
    pilot.windowCount++;
    if (pilot.windowCount > ROOMS.maxMessagesPerSecond) return this.badFrame(pilot);
    const parsed = parseClientMessage(frame);
    if (!parsed.ok) return this.badFrame(pilot);
    pilot.badFrames = 0;
    return this.apply(pilot, parsed.message, nowMs);
  }

  private badFrame(pilot: Pilot): Step {
    pilot.badFrames++;
    return pilot.badFrames >= ROOMS.badFramesBeforeClose ? { out: [], close: [pilot.id] } : emptyStep();
  }

  private apply(pilot: Pilot, message: ClientMessage, nowMs: number): Step {
    switch (message.t) {
      case 'ready': return this.setReady(pilot, message.isReady);
      case 'laps': return this.setLaps(pilot, message.laps);
      case 'start': return this.start(pilot, nowMs);
      case 'rematch': return this.rematch(pilot);
      case 'chat': return this.chat(pilot, message.text, nowMs);
      case 'gate': return this.gate(pilot, message.index, nowMs);
      case 'pose': return this.pose(pilot, message);
    }
  }

  private notice(id: string, text: string): Step {
    return { out: [{ to: id, message: { t: 'error', message: text } }], close: [] };
  }

  private setReady(pilot: Pilot, isReady: boolean): Step {
    if (this.phase !== 'lobby') return emptyStep();
    pilot.isReady = isReady;
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  private setLaps(pilot: Pilot, laps: number): Step {
    if (this.phase !== 'lobby' || pilot.id !== this.hostId) return emptyStep();
    this.laps = laps;
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  private start(pilot: Pilot, nowMs: number): Step {
    if (this.phase !== 'lobby') return emptyStep();
    if (pilot.id !== this.hostId) return this.notice(pilot.id, 'Only the host can start the race.');
    const here = this.connected();
    if (here.length < ROOMS.minPilotsToStart) return this.notice(pilot.id, 'You need at least two pilots to race.');
    if (here.some((p) => p.id !== this.hostId && !p.isReady)) return this.notice(pilot.id, 'Everyone must be ready.');
    this.phase = 'countdown';
    this.raceStartMs = nowMs + ROOMS.countdownMs;
    this.firstFinishMs = 0;
    this.finishedCount = 0;
    for (const p of here) this.resetProgress(p);
    const step = emptyStep();
    this.broadcastRoom(step);
    step.out.push({ to: EVERYONE, message: { t: 'countdown', startsInMs: ROOMS.countdownMs } });
    return step;
  }

  private resetProgress(p: Pilot): void {
    p.gatesPassed = 0;
    p.lastGateAtMs = this.raceStartMs;
    p.lapStartedAtMs = this.raceStartMs;
    p.bestLapS = 0;
    p.finishTimeS = 0;
    p.place = 0;
    p.dNextM = 0;
  }

  private chat(pilot: Pilot, text: string, nowMs: number): Step {
    if (nowMs - pilot.lastChatAtMs < ROOMS.chatMinGapMs) return emptyStep();
    pilot.lastChatAtMs = nowMs;
    return { out: [{ to: EVERYONE, message: { t: 'chat', from: pilot.id, text } }], close: [] };
  }

  private pose(pilot: Pilot, m: Extract<ClientMessage, { t: 'pose' }>): Step {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return emptyStep();
    pilot.dNextM = m.dNextM;
    const { x, y, z, yaw, pitch, roll } = m;
    return { out: [{ to: EVERYONE, except: pilot.id, message: { t: 'pose', id: pilot.id, x, y, z, yaw, pitch, roll } }], close: [] };
  }

  private gate(pilot: Pilot, index: number, nowMs: number): Step {
    const step = emptyStep();
    if (this.phase !== 'racing' || pilot.place > 0) return step;
    if (index !== pilot.gatesPassed % GATES_PER_LAP) return step;
    if (nowMs - pilot.lastGateAtMs < ROOMS.minGateGapMs) return step;
    pilot.gatesPassed++;
    pilot.lastGateAtMs = nowMs;
    if (index === 0) this.crossStartLine(pilot, nowMs);
    if (pilot.gatesPassed >= this.laps * GATES_PER_LAP + 1) this.finishPilot(pilot, nowMs, step);
    step.out.push({ to: EVERYONE, message: { t: 'standings', rows: this.standingRows() } });
    this.finishIfDone(step);
    return step;
  }

  /** Gate 0 is the start/finish line: the first crossing starts lap 1, each later one completes a lap. */
  private crossStartLine(pilot: Pilot, nowMs: number): void {
    if (pilot.gatesPassed > 1) {
      const lapS = (nowMs - pilot.lapStartedAtMs) / 1000;
      if (pilot.bestLapS === 0 || lapS < pilot.bestLapS) pilot.bestLapS = lapS;
    }
    pilot.lapStartedAtMs = nowMs;
  }

  private finishPilot(pilot: Pilot, nowMs: number, step: Step): void {
    this.finishedCount++;
    pilot.place = this.finishedCount;
    pilot.finishTimeS = (nowMs - this.raceStartMs) / 1000;
    if (this.firstFinishMs === 0) this.firstFinishMs = nowMs;
    step.out.push({ to: EVERYONE, message: { t: 'finish', id: pilot.id, place: pilot.place, timeS: pilot.finishTimeS } });
  }

  /** Race order: finished pilots by place, then most gates, then closest to the next gate. */
  standings(): string[] {
    return [...this.pilots.values()]
      .sort((a, b) => {
        if (a.place !== b.place) return (a.place || Infinity) - (b.place || Infinity);
        if (a.gatesPassed !== b.gatesPassed) return b.gatesPassed - a.gatesPassed;
        return a.dNextM - b.dNextM;
      })
      .map((p) => p.id);
  }

  standingRows(): StandingEntry[] {
    return this.standings().flatMap((id) => {
      const p = this.pilots.get(id);
      return p ? [{ id, gates: p.gatesPassed }] : [];
    });
  }

  /** Time-driven changes: the countdown ending, the grace period after the first finish, the hard stop. */
  tick(nowMs: number): Step {
    const step = emptyStep();
    if (this.phase === 'countdown' && nowMs >= this.raceStartMs) {
      this.phase = 'racing';
      step.out.push({ to: EVERYONE, message: { t: 'go' } });
      this.broadcastRoom(step);
    }
    if (this.phase === 'racing') {
      const graceOver = this.firstFinishMs > 0 && nowMs - this.firstFinishMs >= ROOMS.graceAfterFirstFinishMs;
      if (graceOver || nowMs - this.raceStartMs >= ROOMS.raceHardStopMs) this.endRace(step);
    }
    return step;
  }

  /** When the server should next call `tick`, or 0 when nothing is pending. */
  nextWakeMs(): number {
    if (this.phase === 'countdown') return this.raceStartMs;
    if (this.phase !== 'racing') return 0;
    const hardStop = this.raceStartMs + ROOMS.raceHardStopMs;
    return this.firstFinishMs > 0 ? Math.min(hardStop, this.firstFinishMs + ROOMS.graceAfterFirstFinishMs) : hardStop;
  }

  private finishIfDone(step: Step): void {
    if (this.phase !== 'racing') return;
    const racers = this.connected();
    if (racers.length === 0 || racers.every((p) => p.place > 0)) this.endRace(step);
  }

  private endRace(step: Step): void {
    this.phase = 'results';
    step.out.push({ to: EVERYONE, message: { t: 'results', rows: this.results() } });
    this.broadcastRoom(step);
  }

  private results(): ResultRow[] {
    return this.standings().flatMap((id) => {
      const p = this.pilots.get(id);
      return p ? [{ id: p.id, name: p.name, place: p.place, timeS: p.finishTimeS, bestLapS: p.bestLapS }] : [];
    });
  }

  private rematch(pilot: Pilot): Step {
    if (this.phase !== 'results') return emptyStep();
    if (pilot.id !== this.hostId) return this.notice(pilot.id, 'Only the host can start a rematch.');
    for (const p of [...this.pilots.values()]) if (!p.isConnected) this.pilots.delete(p.id);
    for (const p of this.pilots.values()) p.isReady = false;
    this.phase = 'lobby';
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  private resetToLobby(): void {
    this.pilots.clear();
    this.hostId = '';
    this.phase = 'lobby';
    this.laps = ROOMS.defaultLaps;
  }
}
