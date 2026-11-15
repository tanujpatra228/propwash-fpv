import { BATTERY } from '../config';
import type { SoundEvent } from '../audio/sfx';
import { batteryBeepIntervalS } from '../audio/motor-model';

/** What the director watches each frame. All plain values, so it has no idea what a mode or a tracker is. */
export interface DirectorFrame {
  dtS: number;
  /** The big countdown text: "3", "2", "1", "GO" or "". */
  countdownText: string;
  /** Last gate passed in order, or -1 before any. */
  lastPassedGate: number;
  completedLaps: number;
  /** True when the most recent lap is the pilot's best. */
  isLastLapBest: boolean;
  charge01: number;
  isLow: boolean;
  isEmpty: boolean;
  isCrashed: boolean;
  /** False in menus. */
  isActive: boolean;
}

/**
 * Turns what changed between frames into sound events: countdown ticks, gate pings that climb in a streak, lap chimes
 * and the low-battery beep. It decides nothing about the game; it only listens to it.
 */
export class AudioDirector {
  private countdownText = '';
  private lastPassedGate = -1;
  private completedLaps = 0;
  private streak = 0;
  private wasCrashed = false;
  private beepTimerS = 0;

  update(f: DirectorFrame): SoundEvent[] {
    const events: SoundEvent[] = [];
    if (!f.isActive) {
      this.reset();
      return events;
    }

    if (f.countdownText !== this.countdownText) {
      if (f.countdownText === 'GO') events.push({ type: 'go' });
      else if (f.countdownText !== '') events.push({ type: 'tick' });
      this.countdownText = f.countdownText;
    }

    if (f.lastPassedGate === -1 && this.lastPassedGate !== -1) this.streak = 0; // the run was reset
    if (f.completedLaps > this.completedLaps) {
      events.push({ type: 'lap', isBest: f.isLastLapBest });
      this.streak++;
    } else if (f.lastPassedGate !== -1 && f.lastPassedGate !== this.lastPassedGate) {
      events.push({ type: 'gate', streak: this.streak });
      this.streak++;
    }
    this.lastPassedGate = f.lastPassedGate;
    this.completedLaps = f.completedLaps;

    if (f.isCrashed && !this.wasCrashed) this.streak = 0;
    this.wasCrashed = f.isCrashed;

    if (f.isLow && !f.isEmpty && !f.isCrashed) {
      this.beepTimerS += f.dtS;
      const interval = batteryBeepIntervalS(f.charge01, BATTERY.lowChargeThreshold01);
      if (this.beepTimerS >= interval) {
        this.beepTimerS = 0;
        events.push({ type: 'batteryBeep' });
      }
    } else {
      this.beepTimerS = 0;
    }
    return events;
  }

  /** Forget everything (menus, a new mode). The next frame starts clean. */
  reset(): void {
    this.countdownText = '';
    this.lastPassedGate = -1;
    this.completedLaps = 0;
    this.streak = 0;
    this.wasCrashed = false;
    this.beepTimerS = 0;
  }
}
