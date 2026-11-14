/**
 * One Durable Object per live race room. A thin shell around the pure `Room` state machine:
 * it owns the sockets, the clock and storage, and nothing else.
 *
 * Free-plan notes: WebSocket Hibernation (`ctx.acceptWebSocket`) means an idle room is not billed for duration,
 * pings are answered by the runtime without waking the object, and the room is stored in SQLite-backed storage.
 */
import { DurableObject } from 'cloudflare:workers';
import { isTrackId, ROOMS, TRACK_DEFS } from '../../src/config';
import { EVERYONE, Room, type RoomSnapshot, type Step } from '../../src/core/room-logic';
import { encode } from '../../src/core/room-protocol';

interface Env {
  ROOMS: DurableObjectNamespace;
}

const STATE_KEY = 'room';

export class RaceRoom extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async load(code: string, trackParam = 'valley'): Promise<Room> {
    if (this.room) return this.room;
    const saved = await this.ctx.storage.get<RoomSnapshot>(STATE_KEY);
    // A new room races on the track of whoever opens it first.
    const track = isTrackId(trackParam) ? trackParam : 'valley';
    this.room = saved ? Room.restore(saved) : new Room(code, TRACK_DEFS[track].worldVersion);
    return this.room;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? '';
    const room = await this.load(code, url.searchParams.get('track') ?? undefined);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // The pilot's id inside the room is random and per connection, so a player's saved pilot id is never shared.
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    const step = room.join(id, url.searchParams.get('name'), Number(url.searchParams.get('world')), Date.now());
    await this.dispatch(step, room);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, frame: string | ArrayBuffer): Promise<void> {
    const id = this.idOf(ws);
    if (!id) return;
    const room = await this.load('');
    await this.dispatch(room.receive(id, frame, Date.now()), room);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.drop(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.drop(ws);
  }

  override async alarm(): Promise<void> {
    const room = await this.load('');
    if (room.pilotCount() === 0) {
      // Nobody has been here for the idle period: forget the room entirely.
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.dispatch(room.tick(Date.now()), room);
  }

  private async drop(ws: WebSocket): Promise<void> {
    const id = this.idOf(ws);
    if (!id) return;
    const room = await this.load('');
    await this.dispatch(room.leave(id, Date.now()), room);
    await this.persist(room);
  }

  private idOf(ws: WebSocket): string | null {
    const attachment = ws.deserializeAttachment() as { id?: unknown } | null;
    return typeof attachment?.id === 'string' ? attachment.id : null;
  }

  private socketOf(id: string): WebSocket | undefined {
    return this.ctx.getWebSockets().find((ws) => this.idOf(ws) === id);
  }

  /** Sends what the room asked for, closes who it asked to close, then saves state and schedules the next timer. */
  private async dispatch(step: Step, room: Room): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const out of step.out) {
      const text = encode(out.message);
      for (const ws of sockets) {
        const id = this.idOf(ws);
        if (id === null || (out.to !== EVERYONE && out.to !== id) || out.except === id) continue;
        try {
          ws.send(text);
        } catch {
          // A socket that cannot be written to is closing; its close event removes the pilot.
        }
      }
    }
    for (const id of step.close) {
      const ws = this.socketOf(id);
      if (ws) await this.closeAndLeave(ws, id, room);
    }
    // Poses and crown updates (several a second) are not saved; every other message is.
    if (step.close.length > 0 || step.out.some((o) => o.message.t !== 'pose' && o.message.t !== 'crown')) await this.persist(room);
  }

  private async closeAndLeave(ws: WebSocket, id: string, room: Room): Promise<void> {
    try {
      ws.close(1008, 'Closed by room');
    } catch {
      // Already closed.
    }
    const step = room.leave(id, Date.now());
    if (step.out.length > 0) await this.dispatch(step, room);
  }

  private async persist(room: Room): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, room.snapshot());
    const wake = room.nextWakeMs();
    if (wake > 0) await this.ctx.storage.setAlarm(wake);
    else if (room.pilotCount() === 0) await this.ctx.storage.setAlarm(Date.now() + ROOMS.roomIdleExpiryMs);
  }
}
