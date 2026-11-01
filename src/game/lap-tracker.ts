/** Gate order, lap timing and splits. Pure logic: no DOM, no scene. Shared by time trial and free flight. */

export type GateEvent =
  | { type: 'start' }
  | { type: 'gate'; index: number; splitS: number; deltaToBestS: number | null }
  | { type: 'lap'; lapTimeS: number; splitsS: number[]; isBest: boolean };

export interface BestLap {
  lapTimeS: number;
  /** Time at each gate (index 0 unused), measured from the lap start. */
  splitsS: number[];
}

export class LapTracker {
  /** Gate that must be crossed next. Gate 0 is the start/finish. */
  nextGate = 0;
  /** Last gate passed in order, or -1 before any. Used for respawns. */
  lastPassedGate = -1;
  completedLaps = 0;
  lastLapS: number | null = null;
  best: BestLap | null = null;
  private lapStartS: number | null = null;
  private splits: number[] = [];

  constructor(
    readonly gateCount: number,
    best: BestLap | null = null,
  ) {
    this.best = best;
    this.splits = new Array<number>(gateCount).fill(0);
  }

  get hasStarted(): boolean {
    return this.lapStartS !== null;
  }

  /** Index of the gate to respawn at, or -1 when none has been passed. */
  get respawnGate(): number {
    return this.lastPassedGate;
  }

  currentLapTimeS(nowS: number): number {
    return this.lapStartS === null ? 0 : Math.max(0, nowS - this.lapStartS);
  }

  /** Reports a gate crossing. Returns null when it is not the expected gate (it then counts for nothing). */
  onGateCrossed(index: number, timeS: number): GateEvent | null {
    if (index !== this.nextGate) return null;
    this.lastPassedGate = index;
    this.nextGate = (index + 1) % this.gateCount;

    if (index === 0) {
      if (this.lapStartS === null) {
        this.lapStartS = timeS;
        this.splits.fill(0);
        return { type: 'start' };
      }
      const lapTimeS = timeS - this.lapStartS;
      const splitsS = [...this.splits];
      const isBest = this.best === null || lapTimeS < this.best.lapTimeS;
      if (isBest) this.best = { lapTimeS, splitsS };
      this.lastLapS = lapTimeS;
      this.completedLaps++;
      this.lapStartS = timeS;
      this.splits.fill(0);
      return { type: 'lap', lapTimeS, splitsS, isBest };
    }

    if (this.lapStartS === null) return { type: 'gate', index, splitS: 0, deltaToBestS: null };
    const splitS = timeS - this.lapStartS;
    this.splits[index] = splitS;
    const bestSplit = this.best?.splitsS[index];
    const deltaToBestS = bestSplit === undefined || bestSplit === 0 ? null : splitS - bestSplit;
    return { type: 'gate', index, splitS, deltaToBestS };
  }

  /** Back to before the first gate. Keeps the best lap. */
  reset(): void {
    this.nextGate = 0;
    this.lastPassedGate = -1;
    this.completedLaps = 0;
    this.lastLapS = null;
    this.lapStartS = null;
    this.splits.fill(0);
  }
}
