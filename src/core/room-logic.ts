/**
 * The live-race room state machine. Pure: no sockets, no timers, no clock of its own. The server feeds it
 * connections, text frames and the current time; it returns who should be sent what and who to disconnect.
 */
import { BOTS, ROOMS, TRACK, TRACK_DEFS, TRACK_IDS, type TrackId } from '../config';
import { CrownGame, type CrownEvent, type CrownSnapshot } from './crown-game';
import { checkPilotName } from './pilot-name';
import {
  parseClientMessage,
  type BotProgressRow,
  type BotSettings,
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
  bots?: BotSettings;
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
  /** An AI pilot: always connected and ready, moved by the host's game, never sends poses. */
  isBot: boolean;
}

const GATES_PER_LAP = TRACK.gateCount;

/** Bots sort after every human in the roster. */
const BOT_JOINED_AT = 1e15;

export interface RoomOptions {
  /** A solo room (run in the browser, no server): one human is enough when there are bots. */
  soloAllowed?: boolean;
}

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
  private bots: BotSettings = { count: BOTS.defaultCount, skill: BOTS.defaultSkill };
  private crown: CrownGame | null = null;
  private readonly pilots = new Map<string, Pilot>();
  private raceStartMs = 0;
  private firstFinishMs = 0;
  private finishedCount = 0;

  constructor(code: string, private worldVersion: number, private readonly options: RoomOptions = {}) {
    this.code = code;
  }

  /** The map this room is playing. */
  get track(): TrackId {
    return TRACK_IDS.find((t) => TRACK_DEFS[t].worldVersion === this.worldVersion) ?? 'valley';
  }

  /** Everything needed to rebuild the room after the server's memory was dropped (hibernation). */
  snapshot(): RoomSnapshot {
    return {
      code: this.code, worldVersion: this.worldVersion, phase: this.phase, hostId: this.hostId, laps: this.laps, mode: this.mode, rules: this.rules, bots: this.bots, crown: this.crown?.snapshot() ?? null,
      raceStartMs: this.raceStartMs, firstFinishMs: this.firstFinishMs, finishedCount: this.finishedCount,
      pilots: [...this.pilots.values()],
    };
  }

  static restore(snapshot: RoomSnapshot, options: RoomOptions = {}): Room {
    const room = new Room(snapshot.code, snapshot.worldVersion, options);
    room.phase = snapshot.phase;
    room.hostId = snapshot.hostId;
    room.laps = snapshot.laps;
    room.mode = snapshot.mode ?? 'race';
    room.rules = snapshot.rules ?? { drain: false, loadout: 'stock' };
    room.bots = snapshot.bots ?? { count: BOTS.defaultCount, skill: BOTS.defaultSkill };
    room.crown = snapshot.crown ? CrownGame.restore(snapshot.crown) : null;
    room.raceStartMs = snapshot.raceStartMs;
    room.firstFinishMs = snapshot.firstFinishMs;
    room.finishedCount = snapshot.finishedCount;
    for (const p of snapshot.pilots) room.pilots.set(p.id, { ...p, worldVersion: p.worldVersion ?? snapshot.worldVersion, key: p.key ?? '', holdUntilMs: p.holdUntilMs ?? 0, isOut: p.isOut ?? false, isBot: p.isBot ?? false });
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

  /** The human pilots in the room right now (bots do not count as being connected). */
  private connected(): Pilot[] {
    return [...this.pilots.values()].filter((p) => p.isConnected && !p.isBot);
  }

  /** Everyone in the race: humans and bots. */
  private present(): Pilot[] {
    return [...this.pilots.values()].filter((p) => p.isConnected);
  }

  private botPilots(): Pilot[] {
    return [...this.pilots.values()].filter((p) => p.isBot);
  }

  private roster(): RosterEntry[] {
    return [...this.pilots.values()]
      .sort((a, b) => a.joinedAtMs - b.joinedAtMs)
      .map((p) => ({ id: p.id, name: p.name, isReady: p.isReady, slot: p.slot, isConnected: p.isConnected, isOnMap: p.worldVersion === this.worldVersion, isBot: p.isBot }));
  }

  private roomMessage(): ServerMessage {
    return { t: 'room', phase: this.phase, mode: this.mode, track: this.track, rules: this.rules, bots: this.bots, hostId: this.hostId, laps: this.laps, pilots: this.roster() };
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
    // The same tab coming back (after reloading into another map or a refresh) takes over its old place, even if the old
    // connection has not been noticed as closed yet, so a reload can never leave a second copy of the pilot behind.
    const returning = key === '' ? undefined : [...this.pilots.values()].find((p) => p.key === key && (p.isConnected || p.holdUntilMs > nowMs));
    if (returning && this.phase === 'lobby') return this.revive(returning, worldVersion, name.name);
    const existing = this.pilots.get(id);
    if (existing?.isConnected) return this.refuse(id, 'You are already in this room in another tab.');
    if (this.phase === 'countdown' || this.phase === 'racing') return this.refuse(id, 'A race is in progress. Join when it ends.');
    if (this.pilots.size >= ROOMS.maxPilots) this.dropOneBot();
    if (this.pilots.size >= ROOMS.maxPilots) return this.refuse(id, 'This room is full.');
    const slot = existing?.slot ?? this.freeSlot();
    if (slot < 0) return this.refuse(id, 'This room is full.');
    const pilot = this.freshPilot(id, name.name, slot, nowMs);
    pilot.worldVersion = worldVersion;
    pilot.key = key;
    this.pilots.set(id, pilot);
    this.syncBots();
    // The first pilot hosts; a host who is only away (reloading into another map) keeps the role.
    if (this.hostId === '' || !this.pilots.has(this.hostId)) this.hostId = id;
    const step = emptyStep();
    step.out.push({ to: id, message: { t: 'welcome', you: id, code: this.code } });
    this.broadcastRoom(step);
    return step;
  }

  /** A pilot comes back (after reloading into another map) and takes over their place. The server closes any old connection. */
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
      worldVersion: this.worldVersion, key: '', holdUntilMs: 0, isOut: false, isBot: false,
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
    if (this.phase === 'lobby') this.syncBots();
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
      case 'bots': return this.setBots(pilot, message);
      case 'botProgress': return this.botProgress(pilot, message.rows, nowMs);
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
    this.syncBots();
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
    for (const p of this.pilots.values()) p.isReady = p.isBot;
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

  /** The host picks how many bots race and how good they are. Races only; the grid keeps a slot for every human. */
  private setBots(pilot: Pilot, m: Extract<ClientMessage, { t: 'bots' }>): Step {
    if (this.phase !== 'lobby' || pilot.id !== this.hostId) return emptyStep();
    this.bots = { count: m.count, skill: m.skill };
    this.syncBots();
    const step = emptyStep();
    this.broadcastRoom(step);
    return step;
  }

  /** Makes the bot pilots match the settings: none outside races, never more than the free grid slots. */
  private syncBots(): void {
    const humans = [...this.pilots.values()].filter((p) => !p.isBot).length;
    const wanted = this.mode === 'race' ? Math.max(0, Math.min(this.bots.count, ROOMS.maxPilots - humans)) : 0;
    let bots = this.botPilots().sort((a, b) => a.slot - b.slot);
    while (bots.length > wanted) {
      const last = bots.pop();
      if (last) this.pilots.delete(last.id);
    }
    while (bots.length < wanted) {
      const slot = this.freeSlot();
      if (slot < 0) break;
      const number = this.nextBotNumber();
      const bot = this.freshPilot(`bot-${number}`, `Bot ${BOTS.names[(number - 1) % BOTS.names.length] ?? number}`, slot, BOT_JOINED_AT);
      bot.isBot = true;
      bot.isReady = true;
      bot.joinedAtMs = BOT_JOINED_AT + number;
      this.pilots.set(bot.id, bot);
      bots = [...bots, bot];
    }
  }

  private nextBotNumber(): number {
    const used = new Set(this.botPilots().map((b) => Number(b.id.slice(4))));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  /** A human wants in and the room is full: the last bot steps aside. */
  private dropOneBot(): void {
    const [last] = this.botPilots().sort((a, b) => b.slot - a.slot);
    if (last) this.pilots.delete(last.id);
  }

  /**
   * The host's game reports how far each bot has got. Gates only ever go forward; a bot that has finished its laps is
   * ranked by the race time in the report, not by when the message arrived.
   */
  private botProgress(host: Pilot, rows: readonly BotProgressRow[], nowMs: number): Step {
    const step = emptyStep();
    if (this.phase !== 'racing' || this.crown || host.id !== this.hostId) return step;
    let changed = false;
    const finishGates = this.laps * GATES_PER_LAP + 1;
    for (const row of rows) {
      const bot = this.pilots.get(row.id);
      if (!bot?.isBot || bot.place > 0) continue;
      bot.dNextM = row.dNextM;
      const gates = Math.min(row.gates, finishGates);
      if (gates <= bot.gatesPassed) continue;
      bot.gatesPassed = gates;
      changed = true;
      if (gates >= finishGates) this.finishBot(bot, row.timeMs, nowMs, step);
    }
    if (changed) step.out.push({ to: EVERYONE, message: { t: 'standings', rows: this.standingRows() } });
    this.finishIfDone(step);
    return step;
  }

  private finishBot(bot: Pilot, timeMs: number, nowMs: number, step: Step): void {
    bot.finishTimeS = timeMs / 1000;
    this.finishedCount++;
    if (this.firstFinishMs === 0) this.firstFinishMs = nowMs;
    this.rankFinished();
    step.out.push({ to: EVERYONE, message: { t: 'finish', id: bot.id, place: bot.place, timeS: bot.finishTimeS } });
  }

  /** Finished pilots take their places by finishing time (a bot's report can arrive after a human who was slower). */
  private rankFinished(): void {
    const finished = [...this.pilots.values()].filter((p) => p.place > 0 || p.finishTimeS > 0).sort((a, b) => a.finishTimeS - b.finishTimeS);
    for (const [i, p] of finished.entries()) p.place = i + 1;
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
    const minHumans = this.options.soloAllowed ? 1 : ROOMS.minPilotsToStart;
    if (here.length < minHumans || this.present().length < ROOMS.minPilotsToStart) return this.notice(pilot.id, this.options.soloAllowed ? 'Add at least one bot to race.' : 'You need at least two pilots to race.');
    if (this.hasHeldPilots(nowMs)) return this.notice(pilot.id, 'Waiting for pilots to finish switching map.');
    if (here.some((p) => p.worldVersion !== this.worldVersion)) return this.notice(pilot.id, `Everyone must be on ${TRACK_DEFS[this.track].name}.`);
    if (here.some((p) => p.id !== this.hostId && !p.isReady)) return this.notice(pilot.id, 'Everyone must be ready.');
    this.phase = 'countdown';
    this.raceStartMs = nowMs + ROOMS.countdownMs;
    this.firstFinishMs = 0;
    this.finishedCount = 0;
    for (const p of this.present()) this.resetProgress(p);
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
      holdLeftMs: game?.holdLeftMs(nowMs) ?? 0,
      respawnLeftMs: game?.respawnLeftMs(nowMs) ?? 0,
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
    pilot.finishTimeS = (nowMs - this.raceStartMs) / 1000;
    this.rankFinished();
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

  /** The crown starts free at the map's crown point at the moment of GO. */
  private startCrown(nowMs: number): void {
    const ids = this.connected().sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.crown = new CrownGame();
    this.crown.start(ids, TRACK_DEFS[this.track].crownSpawn, this.raceStartMs);
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
    const racers = this.present();
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
    for (const p of this.pilots.values()) p.isReady = p.isBot;
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
    this.bots = { count: BOTS.defaultCount, skill: BOTS.defaultSkill };
    this.crown = null;
  }
}
