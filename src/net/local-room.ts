import { WORLD } from '../config';
import { Room, EVERYONE, type Step } from '../core/room-logic';
import { encode, type ClientMessage } from '../core/room-protocol';
import type { RoomClientHandlers, RoomLink } from './room-client';

const ME = 'me';

/**
 * A room that lives in the page, for racing bots alone. It is the very same room logic the server runs, fed through
 * the same messages, so the lobby, countdown, standings and results behave exactly like a live room. Nothing is sent
 * anywhere, so it costs nothing and works offline.
 */
export class LocalRoomClient implements RoomLink {
  readonly pingMs = 0;
  private readonly room = new Room('SOLO0', WORLD.version, { soloAllowed: true });
  private isActive = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly queue: Step[] = [];
  private isDelivering = false;

  constructor(private readonly handlers: RoomClientHandlers) {}

  get isOpen(): boolean {
    return this.isActive;
  }

  connect(_code: string, name: string): void {
    this.isActive = true;
    const step = this.room.join(ME, name, WORLD.version, performance.now());
    queueMicrotask(() => this.deliver(step));
  }

  send(message: ClientMessage): void {
    if (!this.isActive) return;
    this.deliver(this.room.receive(ME, encode(message), performance.now()));
  }

  close(): void {
    this.isActive = false;
    globalThis.clearTimeout(this.timer);
  }

  /**
   * Hands out what the room said. A message handler may answer at once (the game asks for bots when it is welcomed), so
   * steps are queued and delivered in order: a nested answer must never overtake the message that caused it.
   */
  private deliver(step: Step): void {
    this.queue.push(step);
    if (this.isDelivering) return;
    this.isDelivering = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.deliverOne(next);
    } finally {
      this.isDelivering = false;
    }
  }

  private deliverOne(step: Step): void {
    if (!this.isActive) return;
    for (const out of step.out) if (out.to === ME || (out.to === EVERYONE && out.except !== ME)) this.handlers.onMessage(out.message);
    if (step.close.includes(ME)) {
      this.close();
      this.handlers.onClose('The solo room closed.');
      return;
    }
    this.scheduleTick();
  }

  /** The room asks to be woken when something is due (the countdown ending, the grace period after the first finish). */
  private scheduleTick(): void {
    globalThis.clearTimeout(this.timer);
    const wake = this.room.nextWakeMs();
    if (wake <= 0) return;
    this.timer = globalThis.setTimeout(() => this.deliver(this.room.tick(performance.now())), Math.max(0, wake - performance.now()));
  }
}
