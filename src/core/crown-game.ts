/**
 * The crown chase match engine. Pure: no sockets, no timers, no clock of its own. The room feeds it pilot positions and
 * the current time; it keeps score and decides who wears the crown. Time only moves when `advance` is called with a
 * later time, so it needs no timers (positions arrive ten times a second and drive it).
 */
import { CROWN } from '../config';

export interface CrownScore {
  id: string;
  points: number;
}

export interface CrownThreat {
  /** The pilot closest to taking the crown, or '' when nobody is making progress. */
  id: string;
  /** 0..1 of the time needed. */
  progress01: number;
}

export interface CrownSnapshot {
  holderId: string;
  protectedUntilMs: number;
  lastAdvanceMs: number;
  lastBroadcastMs: number;
  startMs: number;
  endMs: number;
  pilots: PilotState[];
}

interface PilotState {
  id: string;
  points: number;
  x: number;
  y: number;
  z: number;
  poseAtMs: number;
  stealMs: number;
}

export type CrownEvent = { type: 'stolen'; from: string; to: string };

export class CrownGame {
  private readonly pilots = new Map<string, PilotState>();
  private holderId = '';
  private protectedUntilMs = 0;
  private lastAdvanceMs = 0;
  private lastBroadcastMs = -Infinity;
  private startMs = 0;
  private endMs = 0;

  get holder(): string {
    return this.holderId;
  }

  get matchEndMs(): number {
    return this.endMs;
  }

  get pilotCount(): number {
    return this.pilots.size;
  }

  /** Begins a match at `nowMs` with the crown on `holderId`. */
  start(ids: readonly string[], holderId: string, nowMs: number): void {
    this.pilots.clear();
    for (const id of ids) this.pilots.set(id, { id, points: 0, x: 0, y: 0, z: 0, poseAtMs: -Infinity, stealMs: 0 });
    this.holderId = this.pilots.has(holderId) ? holderId : (ids[0] ?? '');
    this.protectedUntilMs = nowMs + CROWN.protectMs;
    this.lastAdvanceMs = nowMs;
    this.lastBroadcastMs = -Infinity;
    this.startMs = nowMs;
    this.endMs = nowMs + CROWN.matchMs;
  }

  isOver(nowMs: number): boolean {
    return nowMs >= this.endMs;
  }

  setPose(id: string, x: number, y: number, z: number, nowMs: number): void {
    const p = this.pilots.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.z = z;
    p.poseAtMs = nowMs;
  }

  /** A pilot left. If it was the king, the crown goes to the top scorer. */
  remove(id: string, nowMs: number): CrownEvent[] {
    this.advance(nowMs);
    this.pilots.delete(id);
    if (id !== this.holderId) return [];
    const next = this.scores()[0]?.id ?? '';
    const event: CrownEvent[] = next ? [{ type: 'stolen', from: id, to: next }] : [];
    this.holderId = next;
    this.protectedUntilMs = nowMs + CROWN.protectMs;
    this.resetSteals();
    return event;
  }

  private resetSteals(): void {
    for (const p of this.pilots.values()) p.stealMs = 0;
  }

  private isFresh(p: PilotState, nowMs: number): boolean {
    return nowMs - p.poseAtMs <= CROWN.poseFreshMs;
  }

  /** Moves the clock to `nowMs` (never past the end of the match): scores the king and updates every chaser's progress. */
  advance(nowMs: number): CrownEvent[] {
    const to = Math.min(nowMs, this.endMs);
    const dt = to - this.lastAdvanceMs;
    if (dt <= 0) return [];
    this.lastAdvanceMs = to;
    const king = this.pilots.get(this.holderId);
    if (king) king.points += (dt / 1000) * CROWN.pointsPerSecond;
    if (!king) return [];
    const isProtected = to < this.protectedUntilMs;
    for (const p of this.pilots.values()) {
      if (p === king) continue;
      const near = !isProtected && this.isFresh(p, to) && this.isFresh(king, to) && Math.hypot(p.x - king.x, p.y - king.y, p.z - king.z) <= CROWN.stealRangeM;
      p.stealMs = near ? p.stealMs + dt : Math.max(0, p.stealMs - dt * CROWN.drainFactor);
      if (p.stealMs >= CROWN.stealMs) {
        const event: CrownEvent = { type: 'stolen', from: king.id, to: p.id };
        this.holderId = p.id;
        this.protectedUntilMs = to + CROWN.protectMs;
        this.resetSteals();
        return [event];
      }
    }
    return [];
  }

  /** Everyone's points, highest first. Ties keep the earlier-joined pilot first. */
  scores(): CrownScore[] {
    return [...this.pilots.values()].map((p) => ({ id: p.id, points: p.points })).sort((a, b) => b.points - a.points);
  }

  /** Who is closest to taking the crown. */
  threat(): CrownThreat {
    let best: CrownThreat = { id: '', progress01: 0 };
    for (const p of this.pilots.values()) {
      if (p.id === this.holderId) continue;
      const progress01 = Math.min(1, p.stealMs / CROWN.stealMs);
      if (progress01 > best.progress01) best = { id: p.id, progress01 };
    }
    return best;
  }

  /** True at most once per `broadcastEveryMs`: the room sends a `crown` update when this says so (or when the king changes). */
  shouldBroadcast(nowMs: number): boolean {
    if (nowMs - this.lastBroadcastMs < CROWN.broadcastEveryMs) return false;
    this.lastBroadcastMs = nowMs;
    return true;
  }

  remainingMs(nowMs: number): number {
    return Math.max(0, this.endMs - nowMs);
  }

  snapshot(): CrownSnapshot {
    return {
      holderId: this.holderId, protectedUntilMs: this.protectedUntilMs, lastAdvanceMs: this.lastAdvanceMs,
      lastBroadcastMs: Number.isFinite(this.lastBroadcastMs) ? this.lastBroadcastMs : 0, startMs: this.startMs, endMs: this.endMs,
      pilots: [...this.pilots.values()].map((p) => ({ ...p, poseAtMs: Number.isFinite(p.poseAtMs) ? p.poseAtMs : 0 })),
    };
  }

  static restore(s: CrownSnapshot): CrownGame {
    const game = new CrownGame();
    game.holderId = s.holderId;
    game.protectedUntilMs = s.protectedUntilMs;
    game.lastAdvanceMs = s.lastAdvanceMs;
    game.lastBroadcastMs = s.lastBroadcastMs;
    game.startMs = s.startMs;
    game.endMs = s.endMs;
    for (const p of s.pilots) game.pilots.set(p.id, { ...p });
    return game;
  }
}
