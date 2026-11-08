/**
 * Browser side of a live-race room: one WebSocket, typed messages in and out, and a ping so the lobby can show latency.
 * Never throws: failures arrive as `onClose` with a message safe to show the player.
 */
import { ACTIVE_TRACK_ID, ROOMS, WORLD } from '../config';
import { encode, type ClientMessage, type ServerMessage } from '../core/room-protocol';

export interface RoomClientHandlers {
  onMessage(message: ServerMessage): void;
  /** The connection ended (or never opened). `reason` is player-facing. */
  onClose(reason: string): void;
}

const GENERIC_CLOSE = 'Disconnected from the room.';

function isServerMessage(value: unknown): value is ServerMessage {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}

export async function createRoom(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch('/api/rooms', { method: 'POST', signal: signal ?? AbortSignal.timeout(ROOMS.connectTimeoutMs) });
    if (!response.ok) return null;
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

export class RoomClient {
  private socket: WebSocket | null = null;
  private pingTimer = 0;
  private connectTimer = 0;
  private pingSentAtMs = 0;
  private isClosed = false;
  pingMs = 0;

  constructor(private readonly handlers: RoomClientHandlers) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(code: string, name: string): void {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const query = new URLSearchParams({ name, world: String(WORLD.version), track: ACTIVE_TRACK_ID });
    try {
      this.socket = new WebSocket(`${scheme}://${window.location.host}/api/rooms/${code}/ws?${query.toString()}`);
    } catch {
      this.finish('Could not connect to live racing.');
      return;
    }
    const socket = this.socket;
    this.connectTimer = window.setTimeout(() => {
      if (!this.isOpen) this.finish('Live racing is not reachable right now. Try again later.');
    }, ROOMS.connectTimeoutMs);
    socket.onopen = () => {
      window.clearTimeout(this.connectTimer);
      this.pingTimer = window.setInterval(() => this.ping(), ROOMS.pingIntervalMs);
      this.ping();
    };
    socket.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
    socket.onclose = () => this.finish(GENERIC_CLOSE);
    socket.onerror = () => this.finish('Could not connect to live racing.');
  }

  private ping(): void {
    if (!this.isOpen) return;
    this.pingSentAtMs = performance.now();
    this.socket?.send('ping');
  }

  private receive(data: unknown): void {
    if (data === 'pong') {
      this.pingMs = Math.round(performance.now() - this.pingSentAtMs);
      return;
    }
    if (typeof data !== 'string') return;
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      return;
    }
    if (isServerMessage(value)) this.handlers.onMessage(value);
  }

  send(message: ClientMessage): void {
    if (this.isOpen) this.socket?.send(encode(message));
  }

  /** Leaves the room on purpose. `onClose` is not called. */
  close(): void {
    this.isClosed = true;
    this.cleanup();
  }

  private finish(reason: string): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.cleanup();
    this.handlers.onClose(reason);
  }

  private cleanup(): void {
    window.clearTimeout(this.connectTimer);
    window.clearInterval(this.pingTimer);
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}
