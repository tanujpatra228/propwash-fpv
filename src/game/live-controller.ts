import type { Group, Scene } from 'three';
import { ACTIVE_TRACK_ID, ROOMS, TRACK_DEFS, type TrackId } from '../config';
import { reloadIntoRoomMap } from '../core/track-switch';
import { getRoomKey } from '../net/room-key';
import { normaliseRoomCode, type PoseFields, type RosterEntry, type RoomMode, type RoomPhase, type RoomRules, type ServerMessage, type StandingEntry } from '../core/room-protocol';
import { createCrown } from '../drone/crown';
import { CrownBeacon } from './crown-beacon';
import { loadPilotName, savePilotName } from '../net/pilot-identity';
import { createRoom, RoomClient } from '../net/room-client';
import { LobbyScreen } from '../ui/lobby-screen';
import { askPilotName } from '../ui/name-prompt';
import type { CrownSession, CrownUpdate, LiveCrown } from './modes/live-crown';
import type { LiveRace, LiveSession } from './modes/live-race';
import type { PilotMarker } from './modes/mode';
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
  private client: RoomClient | null = null;
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
      case 'welcome': this.myId = m.you; break;
      case 'room': this.onRoom(m); break;
      case 'chat': this.lobby.addChat(this.roster.find((p) => p.id === m.from)?.name ?? '?', m.text); break;
      case 'countdown': this.active?.onCountdown(m.startsInMs); break;
      case 'go': this.active?.onGo(); break;
      case 'crown': this.onCrown(m); break;
      case 'pose': this.drones.push(m.id, m, performance.now()); break;
      case 'standings': this.order = m.rows; break;
      case 'finish': this.mode?.onFinish(m.id, m.place); break;
      case 'out': this.mode?.onOut(m.id); break;
      case 'results': this.active?.onResults(m.rows); break;
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
    this.roster = m.pilots;
    this.mySlot = m.pilots.find((p) => p.id === this.myId)?.slot ?? 0;
    this.drones.setRoster(m.pilots, this.myId);
    // The room plays another map than this page loaded: reload into it (the server holds our place meanwhile).
    if (m.phase === 'lobby' && m.track !== ACTIVE_TRACK_ID && this.switchMap(m.track)) return;
    if (m.track === ACTIVE_TRACK_ID) this.mapSwitches = 0;
    if (m.phase === 'lobby') {
      if (previous !== 'lobby') this.host.returnToLobby();
      this.order = [];
      this.crown = NO_CROWN;
      this.playerCrown.visible = false;
      this.beacon.setVisible(false);
      this.drones.setKing('');
      this.lobby.showRoom({ code: this.code, myId: this.myId, hostId: m.hostId, laps: m.laps, mode: m.mode, track: m.track, rules: m.rules, pilots: m.pilots, pingMs: this.client?.pingMs ?? 0 });
    } else if (m.phase === 'countdown' && previous === 'lobby') {
      this.order = [];
      this.drones.reset();
      this.lobby.hide();
      this.host.resumeInput();
      this.host.startRace(m.mode === 'crown' ? 'crown' : 'live');
    }
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
    this.drones.update(nowMs, dtS);
    this.beacon.update(dtS);
  }
}
