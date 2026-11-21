import type { Group, Scene } from 'three';
import { ACTIVE_TRACK_ID, BOTS, ROOMS, TRACK_DEFS, type BotSkillId, type TrackId } from '../config';
import { loadBotPace, nextPace, paceLabel, saveBotPace } from '../core/bot-pace';
import { reloadIntoRoomMap } from '../core/track-switch';
import { getRoomKey } from '../net/room-key';
import { normaliseRoomCode, type PoseFields, type ResultRow, type RosterEntry, type RoomMode, type RoomPhase, type RoomRules, type ServerMessage, type StandingEntry } from '../core/room-protocol';
import { createCrown } from '../drone/crown';
import { CrownBeacon } from './crown-beacon';
import { loadPilotName, savePilotName } from '../net/pilot-identity';
import { LocalRoomClient } from '../net/local-room';
import { createRoom, RoomClient, type RoomLink } from '../net/room-client';
import { LobbyScreen } from '../ui/lobby-screen';
import { askPilotName } from '../ui/name-prompt';
import type { CrownSession, CrownUpdate, LiveCrown } from './modes/live-crown';
import type { LiveRace, LiveSession } from './modes/live-race';
import type { PilotMarker } from './modes/mode';
import { BotFleet } from './bot-fleet';
import { RemoteDrones } from './remote-drones';

/** What the controller asks of the game. */
export interface LiveHost {
  scene: Scene;
  /** The player's own drone model, which wears the crown when the player is king. */
  playerModel: Group;
  pauseInput(): void;
  resumeInput(): void;
  /** Start flying the race or crown chase mode now. */
  startRace(id: 'live' | 'crown'): void;
  /** Go back to the menu scene but stay in the room. */
  returnToLobby(): void;
  notify(title: string, subtitle: string): void;
}

/** Owns the room connection, the lobby screen and the other pilots' drones. Feeds server events to the live race mode. */
const NO_CROWN: CrownUpdate = { t: 'crown', holderId: '', scores: [], threatId: '', threat01: 0, remainingMs: 0, holdLeftMs: 0, respawnLeftMs: 0 };

export class LiveController implements LiveSession, CrownSession {
  private readonly lobby: LobbyScreen;
  private readonly drones: RemoteDrones;
  private client: RoomLink | null = null;
  private readonly botFleet: BotFleet;
  /** A solo race against bots: the room runs in this page, nothing goes over the network. */
  private isSolo = false;
  private botSettings = { count: 0 as number, skill: BOTS.defaultSkill as BotSkillId };
  private mode: LiveRace | null = null;
  private crownMode: LiveCrown | null = null;
  private roomMode: RoomMode = 'race';
  private roomTrack: TrackId = ACTIVE_TRACK_ID;
  rules: RoomRules = { drain: false, loadout: 'stock' };
  private readonly playerCrown = createCrown();
  private readonly beacon: CrownBeacon;
  crown: CrownUpdate = NO_CROWN;
  private name = '';
  private code = '';
  private phase: RoomPhase = 'lobby';
  private hostId = '';
  private laps: number = ROOMS.defaultLaps;
  private lastError = '';
  private isSwitching = false;
  /** How many times in a row we have reloaded to follow the room's map (stored in the page, so it resets on a fresh visit). */
  private get mapSwitches(): number {
    try {
      return Number(window.sessionStorage.getItem('pw.mapSwitches') ?? 0);
    } catch {
      return 0;
    }
  }

  private set mapSwitches(count: number) {
    try {
      window.sessionStorage.setItem('pw.mapSwitches', String(count));
    } catch {
      // Blocked storage: no loop guard, but also no loop (the reload keeps the room's map in the link).
    }
  }
  myId = '';
  mySlot = 0;
  roster: readonly RosterEntry[] = [];
  order: readonly StandingEntry[] = [];

  get others(): readonly PilotMarker[] {
    return this.drones.visible;
  }

  constructor(private readonly host: LiveHost) {
    this.drones = new RemoteDrones(host.scene);
    this.botFleet = new BotFleet((id, pose, nowMs) => this.drones.pushPose(id, pose, nowMs));
    const [bx, by, bz] = TRACK_DEFS[ACTIVE_TRACK_ID].crownSpawn;
    this.beacon = new CrownBeacon(bx, by, bz);
    host.scene.add(this.beacon.group);
    host.playerModel.add(this.playerCrown);
    this.lobby = new LobbyScreen({
      onCreate: () => void this.create(),
      onJoin: (code) => this.connect(code),
      onReady: (isReady) => this.client?.send({ t: 'ready', isReady }),
      onLaps: (laps) => this.client?.send({ t: 'laps', laps }),
      onMode: (mode) => this.client?.send({ t: 'mode', mode }),
      onTrack: (track) => this.client?.send({ t: 'track', track }),
      onRules: (drain, loadout) => this.client?.send({ t: 'rules', drain, loadout }),
      onBots: (count, skill) => this.client?.send({ t: 'bots', count, skill }),
      onStart: () => this.client?.send({ t: 'start' }),
      onChat: (text) => this.client?.send({ t: 'chat', text }),
      onCopyLink: () => this.copyLink(),
      onLeave: () => this.leave(),
    });
  }

  attachMode(mode: LiveRace): void {
    this.mode = mode;
  }

  attachCrownMode(mode: LiveCrown): void {
    this.crownMode = mode;
  }

  /** Whichever mode the room is playing. */
  private get active(): LiveRace | LiveCrown | null {
    return this.roomMode === 'crown' ? this.crownMode : this.mode;
  }

  get isHost(): boolean {
    return this.myId !== '' && this.myId === this.hostId;
  }

  get totalLaps(): number {
    return this.laps;
  }

  /** Opens "Race friends". With a code (from an invite link) it joins that room straight away. */
  async open(code?: string): Promise<void> {
    this.host.pauseInput();
    if (!(await this.ensureName())) {
      this.host.resumeInput();
      return;
    }
    const valid = code ? normaliseRoomCode(code) : null;
    if (valid) this.connect(valid);
    else this.lobby.showEntry(code ? 'That invite link has an invalid room code.' : '');
  }

  /** Opens "Play the bots": the same lobby and match, in this page, with no server. */
  async openSolo(): Promise<void> {
    this.host.pauseInput();
    if (!(await this.ensureName())) {
      this.host.resumeInput();
      return;
    }
    this.client?.close();
    this.isSolo = true;
    this.lastError = '';
    this.lobby.clearChat();
    this.code = 'SOLO';
    this.client = new LocalRoomClient({ onMessage: (m) => this.onMessage(m), onClose: (reason) => this.onClose(reason) });
    this.client.connect(this.code, this.name);
  }

  private async ensureName(): Promise<boolean> {
    const saved = loadPilotName();
    if (saved) {
      this.name = saved;
      return true;
    }
    const picked = await askPilotName('');
    if (!picked) return false;
    savePilotName(picked);
    this.name = picked;
    return true;
  }

  private async create(): Promise<void> {
    this.lobby.setMessage('Creating a room…');
    const code = await createRoom();
    if (code) this.connect(code);
    else this.lobby.showEntry('Live racing is not reachable right now. Try again later.');
  }

  private connect(code: string): void {
    this.client?.close();
    this.isSolo = false;
    this.lastError = '';
    this.lobby.clearChat();
    this.lobby.setMessage('Connecting…');
    this.code = code;
    this.client = new RoomClient({ onMessage: (m) => this.onMessage(m), onClose: (reason) => this.onClose(reason) });
    this.client.connect(code, this.name, getRoomKey());
  }

  /** Leaves the room and closes every live-race screen. Safe to call at any time. */
  leave(): void {
    this.client?.close();
    this.client = null;
    this.reset();
    this.lobby.hide();
    this.host.resumeInput();
  }

  private reset(): void {
    this.phase = 'lobby';
    this.myId = '';
    this.hostId = '';
    this.roster = [];
    this.order = [];
    this.laps = ROOMS.defaultLaps;
    this.roomMode = 'race';
    this.rules = { drain: false, loadout: 'stock' };
    this.botSettings = { count: 0, skill: BOTS.defaultSkill };
    this.isSolo = false;
    this.botFleet.clear();
    this.crown = NO_CROWN;
    this.playerCrown.visible = false;
    this.beacon.setVisible(false);
    this.drones.clear();
  }

  private onClose(reason: string): void {
    const message = this.lastError || reason;
    const wasRacing = this.phase === 'countdown' || this.phase === 'racing' || this.phase === 'results';
    this.client = null;
    this.reset();
    if (wasRacing) this.host.returnToLobby();
    this.lobby.showEntry(message);
  }

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case 'welcome':
        this.myId = m.you;
        if (this.isSolo) this.client?.send({ t: 'bots', count: BOTS.maxBots > 3 ? 3 : BOTS.maxBots, skill: BOTS.defaultSkill });
        break;
      case 'room': this.onRoom(m); break;
      case 'chat': this.lobby.addChat(this.roster.find((p) => p.id === m.from)?.name ?? '?', m.text); break;
      case 'countdown': this.active?.onCountdown(m.startsInMs); break;
      case 'go':
        this.botFleet.go(performance.now());
        this.active?.onGo();
        break;
      case 'crown': this.onCrown(m); break;
      case 'pose': this.drones.push(m.id, m, performance.now()); break;
      case 'standings': this.order = m.rows; break;
      case 'finish': this.mode?.onFinish(m.id, m.place); break;
      case 'out': this.mode?.onOut(m.id); break;
      case 'results':
        this.botFleet.clear();
        this.adaptBots(m.rows);
        this.active?.onResults(m.rows);
        break;
      case 'error': this.lastError = m.message; if (this.phase !== 'lobby') this.host.notify('Live race', m.message); break;
    }
  }

  private onRoom(m: Extract<ServerMessage, { t: 'room' }>): void {
    const previous = this.phase;
    this.phase = m.phase;
    this.hostId = m.hostId;
    this.laps = m.laps;
    this.roomMode = m.mode;
    this.roomTrack = m.track;
    this.rules = m.rules;
    this.botSettings = m.bots;
    this.roster = m.pilots;
    this.mySlot = m.pilots.find((p) => p.id === this.myId)?.slot ?? 0;
    this.drones.setRoster(m.pilots, this.myId);
    // The room plays another map than this page loaded: reload into it (the server holds our place meanwhile).
    if (!this.isSolo && m.phase === 'lobby' && m.track !== ACTIVE_TRACK_ID && this.switchMap(m.track)) return;
    if (m.track === ACTIVE_TRACK_ID) this.mapSwitches = 0;
    if (m.phase === 'lobby') {
      if (previous !== 'lobby') this.host.returnToLobby();
      this.order = [];
      this.crown = NO_CROWN;
      this.playerCrown.visible = false;
      this.beacon.setVisible(false);
      this.drones.setKing('');
      this.botFleet.clear();
      this.lobby.showRoom({ code: this.code, myId: this.myId, hostId: m.hostId, laps: m.laps, mode: m.mode, track: m.track, rules: m.rules, bots: m.bots, isSolo: this.isSolo, botPace: this.isSolo ? loadBotPace(m.bots.skill) : 1, pilots: m.pilots, pingMs: this.client?.pingMs ?? 0 });
    } else if (m.phase === 'countdown' && previous === 'lobby') {
      this.order = [];
      this.drones.reset();
      // Race bots are flown by every browser from the race clock; crown chase bots are flown by the room and arrive as poses.
      if (m.mode === 'race') this.botFleet.prepare(m.pilots, m.bots.skill, m.laps, this.isSolo ? loadBotPace(m.bots.skill) : 1);
      this.lobby.hide();
      this.host.resumeInput();
      this.host.startRace(m.mode === 'crown' ? 'crown' : 'live');
    }
  }

  /** Solo: the bots tune themselves to the pilot, a little faster after a win and a little slower after a loss. */
  private adaptBots(rows: readonly ResultRow[]): void {
    if (!this.isSolo || this.botSettings.count < 1 || this.roomMode !== 'race') return;
    const didWin = rows.find((r) => r.id === this.myId)?.place === 1;
    const next = nextPace(loadBotPace(this.botSettings.skill), didWin);
    saveBotPace(this.botSettings.skill, next);
    this.host.notify(didWin ? 'You beat the bots' : 'The bots won', `Next race the ${this.botSettings.skill} bots are ${paceLabel(next)}.`);
  }

  /** The server's crown state: who is king, the scores and how close the nearest chaser is. */
  private onCrown(m: CrownUpdate): void {
    this.crown = m;
    this.drones.setKing(m.holderId);
    this.playerCrown.visible = m.holderId !== '' && m.holderId === this.myId;
    this.beacon.setVisible(m.holderId === '' && m.respawnLeftMs <= 0 && m.remainingMs > 0);
    this.crownMode?.onCrown(m);
  }

  /** Tells the server to hold our place, then reloads into the room's map. Gives up after two tries (a blocked reload loop). */
  private switchMap(track: TrackId): boolean {
    if (this.isSwitching) return true; // the reload is already on its way; further room updates must not start another
    this.isSwitching = true;
    if (this.mapSwitches >= 2) {
      this.lobby.showEntry(`Could not switch to ${TRACK_DEFS[track].name}. Pick it in the Maps menu, then join again.`);
      return false;
    }
    this.mapSwitches = this.mapSwitches + 1;
    this.lobby.showRoomMessage(`Switching to ${TRACK_DEFS[track].name}…`);
    this.client?.send({ t: 'hold' });
    window.setTimeout(() => reloadIntoRoomMap(track, this.code), 250);
    return true;
  }

  private copyLink(): void {
    const url = `${window.location.origin}/?room=${encodeURIComponent(this.code)}&track=${this.roomTrack}`;
    void navigator.clipboard?.writeText(url).catch(() => window.prompt('Copy this link', url));
    this.lobby.setMessage('Invite link copied.');
  }

  // ---- LiveSession: what the race mode sends ----

  sendGate(index: number): void {
    this.client?.send({ t: 'gate', index });
  }

  sendPose(pose: PoseFields & { dNextM: number }): void {
    this.client?.send({ t: 'pose', ...pose });
  }

  sendOut(): void {
    this.client?.send({ t: 'out' });
  }

  requestRematch(): void {
    this.client?.send({ t: 'rematch' });
  }

  /** Called every frame while flying a live race. */
  update(nowMs: number, dtS: number): void {
    this.botFleet.update(nowMs);
    this.drones.update(nowMs, dtS);
    this.beacon.update(dtS);
    // Only the host's game tells the server how the bots are doing (and if the host leaves, the next host takes over).
    if (this.isHost && this.phase === 'racing') {
      const rows = this.botFleet.report(nowMs);
      if (rows) this.client?.send({ t: 'botProgress', rows });
    }
  }
}
