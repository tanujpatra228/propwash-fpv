/**
 * The live-race room state machine. Pure: no sockets, no timers, no clock of its own. The server feeds it
 * connections, text frames and the current time; it returns who should be sent what and who to disconnect.
 */
import { ROOMS, TRACK, TRACK_DEFS, TRACK_IDS, type TrackId } from '../config';
import { CrownGame, type CrownEvent, type CrownSnapshot } from './crown-game';
import { checkPilotName } from './pilot-name';
import {
  parseClientMessage,
  type ClientMessage,
  type ResultRow,
  type RoomMode,
  type RoomRules,
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
  mode?: RoomMode;
  rules?: RoomRules;
  crown?: CrownSnapshot | null;
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
  /** Set by `join` when a returning pilot took over their old place: the id the connection must now use. */
  joinedAs?: string;
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
  /** The world version (map) this pilot's game is on. */
  worldVersion: number;
  /** A secret from the pilot's browser that lets them reclaim this place after reloading into another map. */
  key: string;
  /** While in the future, a disconnected pilot keeps their place (they are reloading into another map). */
  holdUntilMs: number;
  /** Battery race: ran out of battery before the finish. */
  isOut: boolean;
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
  private mode: RoomMode = 'race';
  private rules: RoomRules = { drain: false, loadout: 'stock' };
  private crown: CrownGame | null = null;
  private readonly pilots = new Map<string, Pilot>();
  private raceStartMs = 0;
  private firstFinishMs = 0;
  private finishedCount = 0;

  constructor(code: string, private worldVersion: number) {
    this.code = code;
  }

  /** The map this room is playing. */
  get track(): TrackId {
    return TRACK_IDS.find((t) => TRACK_DEFS[t].worldVersion === this.worldVersion) ?? 'valley';
  }

  /** Everything needed to rebuild the room after the server's memory was dropped (hibernation). */
  snapshot(): RoomSnapshot {
    return {
      code: this.code, worldVersion: this.worldVersion, phase: this.phase, hostId: this.hostId, laps: this.laps, mode: this.mode, rules: this.rules, crown: this.crown?.snapshot() ?? null,
      raceStartMs: this.raceStartMs, firstFinishMs: this.firstFinishMs, finishedCount: this.finishedCount,
      pilots: [...this.pilots.values()],
    };
  }

  static restore(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.code, snapshot.worldVersion);
    room.phase = snapshot.phase;
    room.hostId = snapshot.hostId;
    room.laps = snapshot.laps;
    room.mode = snapshot.mode ?? 'race';
    room.rules = snapshot.rules ?? { drain: false, loadout: 'stock' };
    room.crown = snapshot.crown ? CrownGame.restore(snapshot.crown) : null;
    room.raceStartMs = snapshot.raceStartMs;
    room.firstFinishMs = snapshot.firstFinishMs;
    room.finishedCount = snapshot.finishedCount;
    for (const p of snapshot.pilots) room.pilots.set(p.id, { ...p, worldVersion: p.worldVersion ?? snapshot.worldVersion, key: p.key ?? '', holdUntilMs: p.holdUntilMs ?? 0, isOut: p.isOut ?? false });
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
      .map((p) => ({ id: p.id, name: p.name, isReady: p.isReady, slot: p.slot, isConnected: p.isConnected, isOnMap: p.worldVersion === this.worldVersion }));
  }

  private roomMessage(): ServerMessage {
    return { t: 'room', phase: this.phase, mode: this.mode, track: this.track, rules: this.rules, hostId: this.hostId, laps: this.laps, pilots: this.roster() };
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

  /** A pilot connects. A refusal also closes the connection. `key` lets a pilot reloading into another map reclaim their place. */
  join(id: string, rawName: unknown, worldVersion: number, nowMs: number, key = ''): Step {
    if (!TRACK_IDS.some((t) => TRACK_DEFS[t].worldVersion === worldVersion)) return this.refuse(id, 'Your game version is out of date. Reload the page.');
    const name = checkPilotName(rawName);
    if (!name.ok) return this.refuse(id, name.reason);
    const returning = key === '' ? undefined : [...this.pilots.values()].find((p) => p.key === key && !p.isConnected && p.holdUntilMs > nowMs);
    if (returning && this.phase === 'lobby') return this.revive(returning, worldVersion, name.name);
    const existing = this.pilots.get(id);
    if (existing?.isConnected) return this.refuse(id, 'You are already in this room in another tab.');
    if (this.phase === 'countdown' || this.phase === 'racing') return this.refuse(id, 'A race is in progress. Join when it ends.');
    if (this.pilots.size >= ROOMS.maxPilots) return this.refuse(id, 'This room is full.');
    const slot = existing?.slot ?? this.freeSlot();
    if (slot < 0) return this.refuse(id, 'This room is full.');
    const pilot = this.freshPilot(id, name.name, slot, nowMs);
    pilot.worldVersion = worldVersion;
    pilot.key = key;
    this.pilots.set(id, pilot);
    // The first pilot hosts; a host who is only away (reloading into another map) keeps the role.
    if (this.hostId === '' || !this.pilots.has(this.hostId)) this.hostId = id;
    const step = emptyStep();
    step.out.push({ to: id, message: { t: 'welcome', you: id, code: this.code } });
    this.broadcastRoom(step);
    return step;
  }

  /** A pilot who held their place comes back (after reloading into another map). */
  private revive(pilot: Pilot, worldVersion: number, name: string): Step {
    pilot.isConnected = true;
    pilot.holdUntilMs = 0;
    pilot.worldVersion = worldVersion;
    pilot.name = name;
    const step = emptyStep();
    step.joinedAs = pilot.id;
    step.out.push({ to: pilot.id, message: { t: 'welcome', you: pilot.id, code: this.code } });
    this.broadcastRoom(step);
    return step;
  }

  private freshPilot(id: string, name: string, slot: number, nowMs: number): Pilot {
    return {
      id, name, isReady: false, slot, joinedAtMs: nowMs, isConnected: true, gatesPassed: 0, lastGateAtMs: 0, lapStartedAtMs: 0,
      bestLapS: 0, finishTimeS: 0, place: 0, dNextM: 0, lastChatAtMs: 0, windowStartMs: nowMs, windowCount: 0, badFrames: 0,
      worldVersion: this.worldVersion, key: '', holdUntilMs: 0, isOut: false,
    };
  }

  /** A pilot disconnects (closed tab, lost network, or kicked). */
  leave(id: string, nowMs: number): Step {
    const pilot = this.pilots.get(id);
    const step = emptyStep();
    if (!pilot?.isConnected) return step;
    pilot.isConnected = false;
    if (this.phase === 'lobby' && pilot.holdUntilMs > nowMs) {
      // Reloading into another map: keep the place (and the host role) until they are back or the hold runs out.
      this.broadcastRoom(step);
      return step;
    }
    const racing = this.phase === 'countdown' || this.phase === 'racing';
    if (!racing && this.phase !== 'results') this.pilots.delete(id);
    if (this.connected().length === 0 && !this.hasHeldPilots(nowMs)) {
      this.resetToLobby();
      return step;
    }
    if (this.hostId === id) this.hostId = this.longestPresent();
    if (this.phase === 'racing' && this.crown) {
      this.crown.remove(id, nowMs);
      step.out.push({ to: EVERYONE, message: this.crownMessage(nowMs) });
      if (this.connected().length < ROOMS.minPilotsToStart) this.endRace(step);
    } else if (this.phase === 'racing') this.finishIfDone(step);
    this.broadcastRoom(step);
    return step;
  }

  /** True while a disconnected pilot is holding their place. */
  private hasHeldPilots(nowMs: number): boolean {
    return [...this.pilots.values()].some((p) => !p.isConnected && p.holdUntilMs > nowMs);
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
      case 'mode': return this.setMode(pilot, message.mode);
      case 'track': return this.setTrack(pilot, message.track);
      case 'rules': return this.setRules(pilot, message);
      case 'out': return this.out(pilot);
      case 'hold': return this.hold(pilot, nowMs);
      case 'start': return this.start(pilot, nowMs);
      case 'rematch': return this.rematch(pilot);
      case 'chat': return this.chat(pilot, message.text, nowMs);
      case 'gate': return this.gate(pilot, message.index, nowMs);
      case 'pose': return this.pose(pilot, message, nowMs);
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

  private setMode(pilot: Pilot, mode: RoomMode): Step {
    if (this.phase !== 'lobby' || pilot.id !== this.hostId) return emptyStep();
    this.mode = mode;
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  /** The host picks the map. Everyone on another map reloads into it, so ready flags start over. */
  private setTrack(pilot: Pilot, track: TrackId): Step {
    if (this.phase !== 'lobby' || pilot.id !== this.hostId) return emptyStep();
    const version = TRACK_DEFS[track].worldVersion;
    if (version === this.worldVersion) return emptyStep();
    this.worldVersion = version;
    for (const p of this.pilots.values()) p.isReady = false;
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  /** The host sets the battery and loadout rules. Draining only applies to races. */
  private setRules(pilot: Pilot, m: Extract<ClientMessage, { t: 'rules' }>): Step {
    if (this.phase !== 'lobby' || pilot.id !== this.hostId) return emptyStep();
    this.rules = { drain: m.drain, loadout: m.loadout };
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  /** A pilot's battery ran out before the finish (battery race): they are out of this race. */
  private out(pilot: Pilot): Step {
    if (this.phase !== 'racing' || this.crown || !this.rules.drain || pilot.place > 0 || pilot.isOut) return emptyStep();
    pilot.isOut = true;
    const step = emptyStep();
    step.out.push({ to: EVERYONE, message: { t: 'out', id: pilot.id } });
    this.finishIfDone(step);
    return step;
  }

  /** A pilot says they are about to reload into another map: keep their place for a while. */
  private hold(pilot: Pilot, nowMs: number): Step {
    if (this.phase === 'lobby') pilot.holdUntilMs = nowMs + ROOMS.holdMs;
    return emptyStep();
  }

  private start(pilot: Pilot, nowMs: number): Step {
    if (this.phase !== 'lobby') return emptyStep();
    if (pilot.id !== this.hostId) return this.notice(pilot.id, 'Only the host can start the game.');
    const here = this.connected();
    if (here.length < ROOMS.minPilotsToStart) return this.notice(pilot.id, 'You need at least two pilots to race.');
    if (this.hasHeldPilots(nowMs)) return this.notice(pilot.id, 'Waiting for pilots to finish switching map.');
    if (here.some((p) => p.worldVersion !== this.worldVersion)) return this.notice(pilot.id, `Everyone must be on ${TRACK_DEFS[this.track].name}.`);
    if (here.some((p) => p.id !== this.hostId && !p.isReady)) return this.notice(pilot.id, 'Everyone must be ready.');
    this.phase = 'countdown';
    this.raceStartMs = nowMs + ROOMS.countdownMs;
    this.firstFinishMs = 0;
    this.finishedCount = 0;
    for (const p of here) this.resetProgress(p);
    this.crown = null;
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
    p.isOut = false;
  }

  private chat(pilot: Pilot, text: string, nowMs: number): Step {
    if (nowMs - pilot.lastChatAtMs < ROOMS.chatMinGapMs) return emptyStep();
    pilot.lastChatAtMs = nowMs;
    return { out: [{ to: EVERYONE, message: { t: 'chat', from: pilot.id, text } }], close: [] };
  }

  private pose(pilot: Pilot, m: Extract<ClientMessage, { t: 'pose' }>, nowMs: number): Step {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return emptyStep();
    pilot.dNextM = m.dNextM;
    const { x, y, z, yaw, pitch, roll } = m;
    const step: Step = { out: [{ to: EVERYONE, except: pilot.id, message: { t: 'pose', id: pilot.id, x, y, z, yaw, pitch, roll } }], close: [] };
    if (this.phase === 'racing' && this.crown) {
      // Positions arrive in whole centimetres; the engine works in metres.
      this.crown.setPose(pilot.id, x / 100, y / 100, z / 100, nowMs);
      this.advanceCrown(nowMs, step);
    }
    return step;
  }

  /** Moves the crown match forward and sends an update when the king changed or it is time for one. */
  private advanceCrown(nowMs: number, step: Step): void {
    const game = this.crown;
    if (!game) return;
    const events: CrownEvent[] = game.advance(nowMs);
    if (events.length > 0 || game.shouldBroadcast(nowMs)) step.out.push({ to: EVERYONE, message: this.crownMessage(nowMs) });
  }

  private crownMessage(nowMs: number): ServerMessage {
    const game = this.crown;
    const threat = game?.threat() ?? { id: '', progress01: 0 };
    return {
      t: 'crown',
      holderId: game?.holder ?? '',
      scores: game?.scores() ?? [],
      threatId: threat.id,
      threat01: threat.progress01,
      remainingMs: game?.remainingMs(nowMs) ?? 0,
    };
  }

  private gate(pilot: Pilot, index: number, nowMs: number): Step {
    const step = emptyStep();
    if (this.phase !== 'racing' || pilot.place > 0 || pilot.isOut) return step;
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
    if (this.phase === 'lobby') this.expireHolds(nowMs, step);
    if (this.phase === 'countdown' && nowMs >= this.raceStartMs) {
      this.phase = 'racing';
      if (this.mode === 'crown') this.startCrown(nowMs);
      step.out.push({ to: EVERYONE, message: { t: 'go' } });
      this.broadcastRoom(step);
      if (this.crown) step.out.push({ to: EVERYONE, message: this.crownMessage(nowMs) });
    }
    if (this.phase === 'racing' && this.crown) {
      this.advanceCrown(nowMs, step);
      if (this.crown.isOver(nowMs)) this.endRace(step);
    } else if (this.phase === 'racing') {
      const graceOver = this.firstFinishMs > 0 && nowMs - this.firstFinishMs >= ROOMS.graceAfterFirstFinishMs;
      if (graceOver || nowMs - this.raceStartMs >= ROOMS.raceHardStopMs) this.endRace(step);
    }
    return step;
  }

  /** Pilots whose hold ran out without coming back leave the room; the host role moves on if it was theirs. */
  private expireHolds(nowMs: number, step: Step): void {
    const gone = [...this.pilots.values()].filter((p) => !p.isConnected && p.holdUntilMs > 0 && p.holdUntilMs <= nowMs);
    if (gone.length === 0) return;
    for (const p of gone) this.pilots.delete(p.id);
    if (this.connected().length === 0 && !this.hasHeldPilots(nowMs)) {
      this.resetToLobby();
      return;
    }
    if (!this.pilots.has(this.hostId)) this.hostId = this.longestPresent();
    this.broadcastRoom(step);
  }

  /** The crown goes to a pilot picked from the clock, at the moment of GO. */
  private startCrown(nowMs: number): void {
    const ids = this.connected().sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.crown = new CrownGame();
    this.crown.start(ids, ids[nowMs % Math.max(1, ids.length)] ?? '', this.raceStartMs);
  }

  /** When the server should next call `tick`, or 0 when nothing is pending. */
  nextWakeMs(): number {
    if (this.phase === 'countdown') return this.raceStartMs;
    if (this.phase === 'lobby') {
      const holds = [...this.pilots.values()].filter((p) => !p.isConnected && p.holdUntilMs > 0).map((p) => p.holdUntilMs);
      return holds.length > 0 ? Math.min(...holds) : 0;
    }
    if (this.phase !== 'racing') return 0;
    if (this.crown) return this.crown.matchEndMs;
    const hardStop = this.raceStartMs + ROOMS.raceHardStopMs;
    return this.firstFinishMs > 0 ? Math.min(hardStop, this.firstFinishMs + ROOMS.graceAfterFirstFinishMs) : hardStop;
  }

  private finishIfDone(step: Step): void {
    if (this.phase !== 'racing') return;
    const racers = this.connected();
    if (racers.length === 0 || racers.every((p) => p.place > 0 || p.isOut)) this.endRace(step);
  }

  private endRace(step: Step): void {
    this.phase = 'results';
    step.out.push({ to: EVERYONE, message: { t: 'results', rows: this.results() } });
    this.broadcastRoom(step);
  }

  private results(): ResultRow[] {
    if (this.crown) {
      // Crown chase: ranked by seconds on the crown. Pilots who left keep their score.
      return this.crown.scores().flatMap((s, i) => {
        const p = this.pilots.get(s.id);
        return p ? [{ id: p.id, name: p.name, place: i + 1, timeS: 0, bestLapS: 0, score: Math.round(s.points * 10) / 10 }] : [];
      });
    }
    return this.standings().flatMap((id) => {
      const p = this.pilots.get(id);
      return p ? [{ id: p.id, name: p.name, place: p.place, timeS: p.finishTimeS, bestLapS: p.bestLapS, score: 0 }] : [];
    });
  }

  private rematch(pilot: Pilot): Step {
    if (this.phase !== 'results') return emptyStep();
    if (pilot.id !== this.hostId) return this.notice(pilot.id, 'Only the host can start a rematch.');
    for (const p of [...this.pilots.values()]) if (!p.isConnected) this.pilots.delete(p.id);
    for (const p of this.pilots.values()) p.isReady = false;
    this.crown = null;
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
    this.mode = 'race';
    this.crown = null;
  }
}
