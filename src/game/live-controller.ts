import type { Scene } from 'three';
import { ROOMS } from '../config';
import { normaliseRoomCode, type PoseFields, type RosterEntry, type RoomPhase, type ServerMessage, type StandingEntry } from '../core/room-protocol';
import { loadPilotName, savePilotName } from '../net/pilot-identity';
import { createRoom, RoomClient } from '../net/room-client';
import { LobbyScreen } from '../ui/lobby-screen';
import { askPilotName } from '../ui/name-prompt';
import type { LiveRace, LiveSession } from './modes/live-race';
import type { PilotMarker } from './modes/mode';
import { RemoteDrones } from './remote-drones';

/** What the controller asks of the game. */
export interface LiveHost {
  scene: Scene;
  pauseInput(): void;
  resumeInput(): void;
  /** Start flying the live race mode now. */
  startRace(): void;
  /** Go back to the menu scene but stay in the room. */
  returnToLobby(): void;
  notify(title: string, subtitle: string): void;
}

/** Owns the room connection, the lobby screen and the other pilots' drones. Feeds server events to the live race mode. */
export class LiveController implements LiveSession {
  private readonly lobby: LobbyScreen;
  private readonly drones: RemoteDrones;
  private client: RoomClient | null = null;
  private mode: LiveRace | null = null;
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
    this.lobby = new LobbyScreen({
      onCreate: () => void this.create(),
      onJoin: (code) => this.connect(code),
      onReady: (isReady) => this.client?.send({ t: 'ready', isReady }),
      onLaps: (laps) => this.client?.send({ t: 'laps', laps }),
      onStart: () => this.client?.send({ t: 'start' }),
      onChat: (text) => this.client?.send({ t: 'chat', text }),
      onCopyLink: () => this.copyLink(),
      onLeave: () => this.leave(),
    });
  }

  attachMode(mode: LiveRace): void {
    this.mode = mode;
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
      case 'countdown': this.mode?.onCountdown(m.startsInMs); break;
      case 'go': this.mode?.onGo(); break;
      case 'pose': this.drones.push(m.id, m, performance.now()); break;
      case 'standings': this.order = m.rows; break;
      case 'finish': this.mode?.onFinish(m.id, m.place); break;
      case 'results': this.mode?.onResults(m.rows); break;
      case 'error': this.lastError = m.message; if (this.phase !== 'lobby') this.host.notify('Live race', m.message); break;
    }
  }

  private onRoom(m: Extract<ServerMessage, { t: 'room' }>): void {
    const previous = this.phase;
    this.phase = m.phase;
    this.hostId = m.hostId;
    this.laps = m.laps;
    this.roster = m.pilots;
    this.mySlot = m.pilots.find((p) => p.id === this.myId)?.slot ?? 0;
    this.drones.setRoster(m.pilots, this.myId);
    if (m.phase === 'lobby') {
      if (previous !== 'lobby') this.host.returnToLobby();
      this.order = [];
      this.lobby.showRoom({ code: this.code, myId: this.myId, hostId: m.hostId, laps: m.laps, pilots: m.pilots, pingMs: this.client?.pingMs ?? 0 });
    } else if (m.phase === 'countdown' && previous === 'lobby') {
      this.order = [];
      this.drones.reset();
      this.lobby.hide();
      this.host.resumeInput();
      this.host.startRace();
    }
  }

  private copyLink(): void {
    const url = `${window.location.origin}/?room=${encodeURIComponent(this.code)}`;
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
