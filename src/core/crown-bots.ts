/**
 * AI pilots for crown chase. Pure: no sockets, no clock of its own, no world. The room feeds it the time and where
 * everyone is; it moves the bots and says where they are. Bots fly the racing line (a closed corridor that already
 * clears terrain and buildings, see `track-lines.ts`) and only step off it for the last few metres to touch the king
 * or to take the crown, so they cannot fly into a wall they never loaded.
 */
import { BOTS, ROOMS, type BotSkillId } from '../config';
import { gridBehindM } from './grid';
import { clamp } from './math';
import type { TrackLine } from './track-lines';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A closed polyline with arc length, so a position on it is one number. */
export class Polyline {
  readonly count: number;
  readonly lengthM: number;
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly zs: number[] = [];
  private readonly cumulative: number[] = [];
  /** Curvature (1/m) at each point. */
  private readonly curvature: number[] = [];

  constructor(line: TrackLine) {
    this.count = line.points.length / 3;
    for (let i = 0; i < this.count; i++) {
      this.xs.push(line.points[i * 3] ?? 0);
      this.ys.push(line.points[i * 3 + 1] ?? 0);
      this.zs.push(line.points[i * 3 + 2] ?? 0);
    }
    let total = 0;
    for (let i = 0; i < this.count; i++) {
      this.cumulative.push(total);
      total += this.segmentLength(i);
    }
    this.lengthM = total;
    for (let i = 0; i < this.count; i++) this.curvature.push(this.curvatureAtPoint(i));
  }

  private at(i: number): number {
    return ((i % this.count) + this.count) % this.count;
  }

  private segmentLength(i: number): number {
    const a = this.at(i);
    const b = this.at(i + 1);
    return Math.hypot((this.xs[b] ?? 0) - (this.xs[a] ?? 0), (this.ys[b] ?? 0) - (this.ys[a] ?? 0), (this.zs[b] ?? 0) - (this.zs[a] ?? 0));
  }

  private curvatureAtPoint(i: number): number {
    const prev = this.at(i - 1);
    const here = this.at(i);
    const next = this.at(i + 1);
    const ax = (this.xs[here] ?? 0) - (this.xs[prev] ?? 0);
    const az = (this.zs[here] ?? 0) - (this.zs[prev] ?? 0);
    const bx = (this.xs[next] ?? 0) - (this.xs[here] ?? 0);
    const bz = (this.zs[next] ?? 0) - (this.zs[here] ?? 0);
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    const angle = Math.acos(clamp((ax * bx + az * bz) / (la * lb), -1, 1));
    return angle / ((la + lb) / 2);
  }

  wrap(s: number): number {
    return ((s % this.lengthM) + this.lengthM) % this.lengthM;
  }

  /** Signed shortest distance along the loop from `from` to `to`, in (-length/2, length/2]. */
  delta(from: number, to: number): number {
    let d = this.wrap(to - from);
    if (d > this.lengthM / 2) d -= this.lengthM;
    return d;
  }

  private segmentAt(s: number): { i: number; t: number } {
    const w = this.wrap(s);
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.cumulative[mid] ?? 0) <= w) lo = mid;
      else hi = mid - 1;
    }
    const length = this.segmentLength(lo) || 1;
    return { i: lo, t: (w - (this.cumulative[lo] ?? 0)) / length };
  }

  pointAt(s: number, out: Vec3): Vec3 {
    const { i, t } = this.segmentAt(s);
    const a = this.at(i);
    const b = this.at(i + 1);
    out.x = (this.xs[a] ?? 0) + ((this.xs[b] ?? 0) - (this.xs[a] ?? 0)) * t;
    out.y = (this.ys[a] ?? 0) + ((this.ys[b] ?? 0) - (this.ys[a] ?? 0)) * t;
    out.z = (this.zs[a] ?? 0) + ((this.zs[b] ?? 0) - (this.zs[a] ?? 0)) * t;
    return out;
  }

  /** Unit direction of travel (forward along the loop) on the ground plane. */
  tangentXZ(s: number, out: { x: number; z: number }): { x: number; z: number } {
    const { i } = this.segmentAt(s);
    const a = this.at(i);
    const b = this.at(i + 1);
    const dx = (this.xs[b] ?? 0) - (this.xs[a] ?? 0);
    const dz = (this.zs[b] ?? 0) - (this.zs[a] ?? 0);
    const length = Math.hypot(dx, dz) || 1;
    out.x = dx / length;
    out.z = dz / length;
    return out;
  }

  /** Arc position of the point on the line closest to a position (all three axes). */
  nearestS(p: Vec3): number {
    let best = Infinity;
    let bestS = 0;
    for (let i = 0; i < this.count; i++) {
      const a = i;
      const b = this.at(i + 1);
      const ax = this.xs[a] ?? 0;
      const ay = this.ys[a] ?? 0;
      const az = this.zs[a] ?? 0;
      const dx = (this.xs[b] ?? 0) - ax;
      const dy = (this.ys[b] ?? 0) - ay;
      const dz = (this.zs[b] ?? 0) - az;
      const len2 = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2, 0, 1);
      const distance = Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t), p.z - (az + dz * t));
      if (distance < best) {
        best = distance;
        bestS = (this.cumulative[i] ?? 0) + t * Math.sqrt(len2);
      }
    }
    return bestS;
  }

  /** The tightest bend (largest curvature, 1/m) within `ahead` metres from `s` in direction `dir` (+1 or -1). */
  maxCurvatureAhead(s: number, dir: number, ahead: number): number {
    let worst = 0;
    const steps = Math.max(1, Math.ceil(ahead / 8));
    for (let k = 0; k <= steps; k++) {
      const { i, t } = this.segmentAt(s + dir * (ahead * k) / steps);
      const here = this.curvature[this.at(i)] ?? 0;
      const next = this.curvature[this.at(i + 1)] ?? 0;
      worst = Math.max(worst, here + (next - here) * t);
    }
    return worst;
  }
}

type Mode = 'line' | 'approach';

interface BotState {
  id: string;
  slot: number;
  /** Arc position on the line and signed speed along it (positive is the way the race runs). */
  s: number;
  v: number;
  /** The bot's offset from the line while it is off it (zero on the line). */
  ox: number;
  oy: number;
  oz: number;
  mode: Mode;
  /** Where the bot wants to be on the line, and the world target of its approach. */
  goalS: number;
  flee: boolean;
  dir: number;
  approach: Vec3;
  nextThinkMs: number;
  /** For the pose: heading and the speed it was last moving at. */
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface BotPose {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

/** What the fleet needs to know about the match each step. */
export interface CrownView {
  /** Who wears the crown, or '' when it lies free or is respawning. */
  holderId: string;
  /** The crown lies free and can be taken now. */
  isCrownReady: boolean;
  crown: Vec3;
  /** Where a pilot is (humans and bots), or null if not known. */
  positionOf(id: string): Vec3 | null;
  /** Everyone in the match. */
  pilotIds: readonly string[];
}

export interface CrownBotsSnapshot {
  skill: BotSkillId;
  lastMs: number;
  bots: BotState[];
}

const tmpPoint: Vec3 = { x: 0, y: 0, z: 0 };
const tmpTangent = { x: 0, z: 0 };
const tmpLinePoint: Vec3 = { x: 0, y: 0, z: 0 };

export class CrownBots {
  private readonly line: Polyline;
  private bots: BotState[] = [];
  private lastMs = 0;
  private skill: BotSkillId = BOTS.defaultSkill;
  /** Where each pilot was when last sampled, and how fast they were moving then (for aiming ahead). */
  private readonly velocities = new Map<string, Vec3>();
  private readonly samples = new Map<string, { x: number; y: number; z: number; atMs: number }>();

  constructor(trackLine: TrackLine, private readonly gate0M = trackLine.gate0M) {
    this.line = new Polyline(trackLine);
  }

  get lengthM(): number {
    return this.line.lengthM;
  }

  /** Puts the bots on their grid slots behind the start line, at rest. */
  start(bots: readonly { id: string; slot: number }[], skill: BotSkillId, nowMs: number): void {
    this.skill = skill;
    this.lastMs = nowMs;
    this.velocities.clear();
    this.samples.clear();
    this.bots = bots.map((b) => {
      const s = this.line.wrap(this.gate0M - gridBehindM(b.slot));
      this.line.pointAt(s, tmpPoint);
      this.line.tangentXZ(s, tmpTangent);
      // Two columns, like the humans' grid: the odd slots on one side of the line, the even ones on the other.
      const side = b.slot % 2 === 0 ? -1 : 1;
      return {
        id: b.id, slot: b.slot, s, v: 0, ox: -tmpTangent.z * side * ROOMS.gridColumnOffsetM, oy: 0, oz: tmpTangent.x * side * ROOMS.gridColumnOffsetM, mode: 'line', goalS: s, flee: false, dir: 1,
        approach: { x: tmpPoint.x, y: tmpPoint.y, z: tmpPoint.z }, nextThinkMs: nowMs, yaw: Math.atan2(-tmpTangent.x, -tmpTangent.z), vx: 0, vy: 0, vz: 0,
      };
    });
  }

  get ids(): string[] {
    return this.bots.map((b) => b.id);
  }

  has(id: string): boolean {
    return this.bots.some((b) => b.id === id);
  }

  remove(id: string): void {
    this.bots = this.bots.filter((b) => b.id !== id);
  }

  /** Moves every bot up to `nowMs` (in steps of at most `stepS`, never catching up more than `maxCatchUpS`). */
  step(nowMs: number, view: CrownView): void {
    const c = BOTS.crown;
    this.sampleVelocities(nowMs, view);
    const gap = Math.min((nowMs - this.lastMs) / 1000, c.maxCatchUpS);
    this.lastMs = nowMs;
    if (gap <= 0) return;
    const steps = Math.max(1, Math.ceil(gap / c.stepS));
    const dtS = gap / steps;
    for (const bot of this.bots) {
      if (nowMs >= bot.nextThinkMs) this.think(bot, nowMs, view);
      for (let i = 0; i < steps; i++) this.move(bot, dtS);
    }
  }

  /** Estimates how fast each pilot is moving from two positions at least a tenth of a second apart. */
  private sampleVelocities(nowMs: number, view: CrownView): void {
    for (const id of view.pilotIds) {
      const p = view.positionOf(id);
      if (!p) continue;
      const last = this.samples.get(id);
      if (!last) {
        this.samples.set(id, { x: p.x, y: p.y, z: p.z, atMs: nowMs });
        continue;
      }
      const dt = (nowMs - last.atMs) / 1000;
      if (dt < 0.1) continue;
      this.velocities.set(id, { x: (p.x - last.x) / dt, y: (p.y - last.y) / dt, z: (p.z - last.z) / dt });
      this.samples.set(id, { x: p.x, y: p.y, z: p.z, atMs: nowMs });
    }
  }

  private think(bot: BotState, nowMs: number, view: CrownView): void {
    const skill = BOTS.crown.skills[this.skill];
    bot.nextThinkMs = nowMs + skill.reactionS * 1000;
    const here = this.position(bot, tmpPoint);
    bot.flee = false;
    bot.mode = 'line';
    if (view.holderId === '') {
      // Free or respawning: wait at the crown point, and go for it as soon as it can be taken.
      bot.goalS = this.line.nearestS(view.crown);
      bot.approach = { ...view.crown };
      if (view.isCrownReady && distance(here, view.crown) < BOTS.crown.claimApproachM) bot.mode = 'approach';
      return;
    }
    if (view.holderId === bot.id) {
      this.chooseFlight(bot, view, skill.fleeLookS);
      return;
    }
    const king = view.positionOf(view.holderId);
    if (!king) return;
    // Aim where the king will be a moment from now (the better the bot, the further ahead).
    const velocity = this.velocities.get(view.holderId);
    const aim = { x: king.x + (velocity?.x ?? 0) * skill.leadS, y: king.y + (velocity?.y ?? 0) * skill.leadS, z: king.z + (velocity?.z ?? 0) * skill.leadS };
    bot.approach = aim;
    bot.goalS = this.line.nearestS(aim);
    if (distance(here, aim) < skill.approachRangeM) bot.mode = 'approach';
  }

  /** Wearing the crown: run along the line the way that keeps the most distance from the nearest chaser a few seconds on. */
  private chooseFlight(bot: BotState, view: CrownView, lookS: number): void {
    const spec = BOTS.skills[this.skill];
    bot.flee = true;
    const run = spec.topSpeedMps * lookS;
    let bestDir = bot.dir;
    let bestScore = -Infinity;
    for (const dir of [1, -1]) {
      this.line.pointAt(bot.s + dir * run, tmpLinePoint);
      let nearest = Infinity;
      for (const id of view.pilotIds) {
        if (id === bot.id) continue;
        const p = view.positionOf(id);
        if (p) nearest = Math.min(nearest, distance(tmpLinePoint, p));
      }
      // A small bias to keep going the same way, so it does not dither between two equal choices.
      const score = nearest + (dir === bot.dir ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }
    bot.dir = bestDir;
    bot.goalS = this.line.wrap(bot.s + bestDir * run);
  }

  private position(bot: BotState, out: Vec3): Vec3 {
    this.line.pointAt(bot.s, out);
    out.x += bot.ox;
    out.y += bot.oy;
    out.z += bot.oz;
    return out;
  }

  private move(bot: BotState, dtS: number): void {
    const c = BOTS.crown;
    const skill = c.skills[this.skill];
    const spec = BOTS.skills[this.skill];
    const before = this.position(bot, tmpPoint);
    const bx = before.x;
    const by = before.y;
    const bz = before.z;

    if (bot.mode === 'approach') {
      // Off the line, straight at the target for the last few metres. The line speed runs down meanwhile.
      this.slowTo(bot, 0, c.brakeMps2, dtS);
      const here = this.position(bot, tmpPoint);
      const toX = bot.approach.x - here.x;
      const toY = bot.approach.y - here.y;
      const toZ = bot.approach.z - here.z;
      const distanceTo = Math.hypot(toX, toY, toZ);
      if (distanceTo > 0.05) {
        const reach = Math.min(distanceTo, spec.topSpeedMps * dtS);
        bot.ox += (toX / distanceTo) * reach;
        bot.oy += (toY / distanceTo) * reach;
        bot.oz += (toZ / distanceTo) * reach;
      }
    } else {
      // On the line: toward the goal, stopping at it unless fleeing, slower through bends.
      const d = this.line.delta(bot.s, bot.goalS);
      const lookAhead = Math.abs(bot.v) * c.bendLookAheadS + c.bendLookMarginM;
      const curvature = this.line.maxCurvatureAhead(bot.s, Math.sign(d) || bot.dir, lookAhead);
      const bendLimit = Math.sqrt(spec.maxLateralAccelMps2 / Math.max(curvature, 1e-4));
      const top = Math.min(spec.topSpeedMps, bendLimit);
      const stopSpeed = bot.flee ? top : Math.min(top, Math.sqrt(2 * c.brakeMps2 * Math.abs(d)));
      const desired = Math.sign(d) * stopSpeed;
      const accel = Math.abs(desired) > Math.abs(bot.v) && Math.sign(desired) === Math.sign(bot.v || desired) ? skill.accelMps2 : c.brakeMps2;
      bot.v += clamp(desired - bot.v, -accel * dtS, accel * dtS);
      // Drift back onto the line after leaving it.
      const offset = Math.hypot(bot.ox, bot.oy, bot.oz);
      if (offset > 0) {
        const back = Math.min(offset, c.returnToLineMps * dtS) / offset;
        bot.ox -= bot.ox * back;
        bot.oy -= bot.oy * back;
        bot.oz -= bot.oz * back;
      }
    }
    bot.s = this.line.wrap(bot.s + bot.v * dtS);
    const after = this.position(bot, tmpPoint);
    bot.vx = (after.x - bx) / dtS;
    bot.vy = (after.y - by) / dtS;
    bot.vz = (after.z - bz) / dtS;
    if (Math.hypot(bot.vx, bot.vz) > 0.5) bot.yaw = Math.atan2(-bot.vx, -bot.vz);
  }

  private slowTo(bot: BotState, target: number, brake: number, dtS: number): void {
    bot.v += clamp(target - bot.v, -brake * dtS, brake * dtS);
  }

  /** Where every bot is now, for the room to broadcast and to feed the crown engine. */
  poses(): BotPose[] {
    return this.bots.map((bot) => {
      const p = this.position(bot, tmpPoint);
      const speed = Math.hypot(bot.vx, bot.vz);
      return { id: bot.id, x: p.x, y: p.y, z: p.z, yaw: bot.yaw, pitch: -Math.min(0.5, speed / 70), roll: 0 };
    });
  }

  velocityOf(id: string): Vec3 | null {
    const bot = this.bots.find((b) => b.id === id);
    return bot ? { x: bot.vx, y: bot.vy, z: bot.vz } : null;
  }

  snapshot(): CrownBotsSnapshot {
    return { skill: this.skill, lastMs: this.lastMs, bots: this.bots.map((b) => ({ ...b, approach: { ...b.approach } })) };
  }

  restore(s: CrownBotsSnapshot): void {
    this.skill = s.skill;
    this.lastMs = s.lastMs;
    this.bots = s.bots.map((b) => ({ ...b, approach: { ...b.approach } }));
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
