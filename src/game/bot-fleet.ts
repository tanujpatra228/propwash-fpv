import { Euler } from 'three';
import { BOTS, type BotSkillId } from '../config';
import { BotRacer } from '../drone/bot-racer';
import type { BotProgressRow, RosterEntry } from '../core/room-protocol';
import type { RemotePose } from '../net/snapshot-buffer';

const euler = new Euler(0, 0, 0, 'YXZ');
const pose: RemotePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };

/** Where the fleet sends each bot's pose (the same smoothing buffer network poses use). */
export type PoseSink = (id: string, pose: RemotePose, nowMs: number) => void;

/**
 * The AI pilots of a live or solo race. Each is a `BotRacer`, a pure function of the race clock, so every browser
 * draws the same bots with nothing sent over the network. The host's game also tells the server how the bots are doing.
 */
export class BotFleet {
  private bots = new Map<string, BotRacer>();
  private goMs = 0;
  private hasStarted = false;
  private lastReportMs = 0;
  private lastReportedGates = new Map<string, number>();

  constructor(private readonly sink: PoseSink) {}

  /** Gets the bots ready on their grid slots (called when the countdown starts). */
  prepare(roster: readonly RosterEntry[], skill: BotSkillId, laps: number, pace = 1): void {
    this.bots = new Map(roster.filter((p) => p.isBot).map((p) => [p.id, new BotRacer(p.slot, skill, laps, pace)]));
    this.hasStarted = false;
    this.lastReportMs = 0;
    this.lastReportedGates.clear();
  }

  /** The race clock starts now. */
  go(nowMs: number): void {
    this.goMs = nowMs;
    this.hasStarted = true;
    this.lastReportMs = nowMs;
  }

  /** Forgets the bots (the race is over or the room closed). */
  clear(): void {
    this.bots.clear();
    this.hasStarted = false;
  }

  get count(): number {
    return this.bots.size;
  }

  /** Moves every bot to the race clock and hands its pose to the drone. Before GO they sit on the grid. */
  update(nowMs: number): void {
    const timeS = this.hasStarted ? Math.max(0, (nowMs - this.goMs) / 1000) : 0;
    for (const [id, bot] of this.bots) {
      bot.advanceTo(timeS);
      euler.setFromQuaternion(bot.quaternion, 'YXZ');
      pose.x = bot.position.x;
      pose.y = bot.position.y;
      pose.z = bot.position.z;
      pose.pitch = euler.x;
      pose.yaw = euler.y;
      pose.roll = euler.z;
      this.sink(id, pose, nowMs);
    }
  }

  /**
   * What the host tells the server: every bot that is still racing, at most every `reportEveryMs`, and at once when a
   * bot gains a gate that finishes its race. Returns null when there is nothing to say.
   */
  report(nowMs: number): BotProgressRow[] | null {
    if (!this.hasStarted || this.bots.size === 0) return null;
    const justFinished = [...this.bots.entries()].some(([id, bot]) => bot.isFinished && this.lastReportedGates.get(id) !== bot.gatesPassed);
    if (!justFinished && nowMs - this.lastReportMs < BOTS.reportEveryMs) return null;
    this.lastReportMs = nowMs;
    const rows: BotProgressRow[] = [];
    for (const [id, bot] of this.bots) {
      if (bot.gatesPassed === 0 && !this.lastReportedGates.has(id) && nowMs - this.goMs < BOTS.reportEveryMs) continue;
      if (this.lastReportedGates.get(id) === bot.gatesPassed && bot.isFinished) continue; // already told
      rows.push({ id, gates: bot.gatesPassed, timeMs: bot.lastCrossingMs, dNextM: Math.round(bot.distanceToNextM) });
      this.lastReportedGates.set(id, bot.gatesPassed);
    }
    return rows.length > 0 ? rows : null;
  }
}
