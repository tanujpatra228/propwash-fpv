/**
 * The crown chase match engine. Pure: no sockets, no timers, no clock of its own. The room feeds it pilot positions and
 * the current time; it keeps score and decides who wears the crown. Time only moves when `advance` is called with a
 * later time, so it needs no timers (positions arrive ten times a second and drive it). A pilot takes the crown by
 * touching the king: passing within `touchRangeM`, judged along the path each drone flew between its last two updates.
 */
import { CROWN } from '../config';

export interface CrownScore {
  id: string;
  points: number;
}

export interface CrownThreat {
  /** The chaser closest to the king, or '' when nobody is within the warning range. */
  id: string;
  /** 0 at the warning range, 1 at touching distance. */
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
  /** The update before the latest one, to check the path between them. */
  px: number;
  py: number;
  pz: number;
  prevAtMs: number;
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
    for (const id of ids) this.pilots.set(id, { id, points: 0, x: 0, y: 0, z: 0, poseAtMs: -Infinity, px: 0, py: 0, pz: 0, prevAtMs: -Infinity });
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
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.prevAtMs = p.poseAtMs;
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
    return event;
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
    if (to < this.protectedUntilMs || !this.isFresh(king, to)) return [];
    // The closest chaser that touched the king takes the crown.
    let taker: PilotState | null = null;
    let takerDistance = Infinity;
    for (const p of this.pilots.values()) {
      if (p === king || !this.isFresh(p, to)) continue;
      const d = this.distance(p, king);
      if (d <= CROWN.touchRangeM && d < takerDistance) {
        taker = p;
        takerDistance = d;
      }
    }
    if (!taker) return [];
    const event: CrownEvent = { type: 'stolen', from: king.id, to: taker.id };
    this.holderId = taker.id;
    this.protectedUntilMs = to + CROWN.protectMs;
    return [event];
  }

  /** The closest the two drones came to each other along the paths they flew between their last two updates. */
  private distance(a: PilotState, b: PilotState): number {
    const hasPathA = Number.isFinite(a.prevAtMs);
    const hasPathB = Number.isFinite(b.prevAtMs);
    // Offset of a from b at the earlier update and at the latest one (a missing earlier update falls back to the latest).
    const x0 = (hasPathA ? a.px : a.x) - (hasPathB ? b.px : b.x);
    const y0 = (hasPathA ? a.py : a.y) - (hasPathB ? b.py : b.y);
    const z0 = (hasPathA ? a.pz : a.z) - (hasPathB ? b.pz : b.z);
    const dx = a.x - b.x - x0;
    const dy = a.y - b.y - y0;
    const dz = a.z - b.z - z0;
    const lengthSq = dx * dx + dy * dy + dz * dz;
    // The offset moves in a straight line from (x0, y0, z0) to the latest one; find the closest point on it to zero.
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(x0 * dx + y0 * dy + z0 * dz) / lengthSq));
    return Math.hypot(x0 + dx * t, y0 + dy * t, z0 + dz * t);
  }

  /** Everyone's points, highest first. Ties keep the earlier-joined pilot first. */
  scores(): CrownScore[] {
    return [...this.pilots.values()].map((p) => ({ id: p.id, points: p.points })).sort((a, b) => b.points - a.points);
  }

  /** The chaser closest to the king, as how near they are inside the warning range (0 far, 1 touching). */
  threat(): CrownThreat {
    const king = this.pilots.get(this.holderId);
    let best: CrownThreat = { id: '', progress01: 0 };
    if (!king) return best;
    for (const p of this.pilots.values()) {
      if (p === king) continue;
      const d = Math.hypot(p.x - king.x, p.y - king.y, p.z - king.z);
      const closeness = Math.max(0, Math.min(1, (CROWN.warnRangeM - d) / (CROWN.warnRangeM - CROWN.touchRangeM)));
      if (closeness > best.progress01) best = { id: p.id, progress01: closeness };
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
