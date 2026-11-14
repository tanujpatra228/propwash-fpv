import type { Group, Scene } from 'three';
import { ACTIVE_TRACK_ID, ROOMS } from '../config';
import { normaliseRoomCode, type PoseFields, type RosterEntry, type RoomMode, type RoomPhase, type ServerMessage, type StandingEntry } from '../core/room-protocol';
import { createCrown } from '../drone/crown';
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
const NO_CROWN: CrownUpdate = { t: 'crown', holderId: '', scores: [], threatId: '', threat01: 0, remainingMs: 0 };

export class LiveController implements LiveSession, CrownSession {
  private readonly lobby: LobbyScreen;
  private readonly drones: RemoteDrones;
  private client: RoomClient | null = null;
  private mode: LiveRace | null = null;
  private crownMode: LiveCrown | null = null;
  private roomMode: RoomMode = 'race';
  private readonly playerCrown = createCrown();
  crown: CrownUpdate = NO_CROWN;
  private name = '';
  private code = '';
  private phase: RoomPhase = 'lobby';
  private hostId = '';
  private laps: number = ROOMS.defaultLaps;
  private lastError = '';
  myId = '';
  mySlot = 0;
  roster: readonly RosterEntry[] = [];
  order: readonly StandingEntry[] = [];

  get others(): readonly PilotMarker[] {
    return this.drones.visible;
  }

  constructor(private readonly host: LiveHost) {
    this.drones = new RemoteDrones(host.scene);
    host.playerModel.add(this.playerCrown);
    this.lobby = new LobbyScreen({
      onCreate: () => void this.create(),
      onJoin: (code) => this.connect(code),
      onReady: (isReady) => this.client?.send({ t: 'ready', isReady }),
      onLaps: (laps) => this.client?.send({ t: 'laps', laps }),
      onMode: (mode) => this.client?.send({ t: 'mode', mode }),
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
    this.client.connect(code, this.name);
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
    this.crown = NO_CROWN;
    this.playerCrown.visible = false;
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
    this.roster = m.pilots;
    this.mySlot = m.pilots.find((p) => p.id === this.myId)?.slot ?? 0;
    this.drones.setRoster(m.pilots, this.myId);
    if (m.phase === 'lobby') {
      if (previous !== 'lobby') this.host.returnToLobby();
      this.order = [];
      this.crown = NO_CROWN;
      this.playerCrown.visible = false;
      this.drones.setKing('');
      this.lobby.showRoom({ code: this.code, myId: this.myId, hostId: m.hostId, laps: m.laps, mode: m.mode, pilots: m.pilots, pingMs: this.client?.pingMs ?? 0 });
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
    this.crownMode?.onCrown(m);
  }

  private copyLink(): void {
    const url = `${window.location.origin}/?room=${encodeURIComponent(this.code)}&track=${ACTIVE_TRACK_ID}`;
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

  requestRematch(): void {
    this.client?.send({ t: 'rematch' });
  }

  /** Called every frame while flying a live race. */
  update(nowMs: number, dtS: number): void {
    this.drones.update(nowMs, dtS);
  }
}
