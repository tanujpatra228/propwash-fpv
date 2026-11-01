import type { Vector3, Quaternion } from 'three';
import type { Battery } from '../../drone/battery';
import type { FlightModel } from '../../drone/flight-model';
import type { Gate } from '../../world/gates';
import type { LapTracker } from '../lap-tracker';
import type { GhostData } from '../../core/ghost-codec';
import type { LessonPanelState } from '../../ui/lesson-panel';
import type { Pose } from '../respawn';

export type ModeId = 'free' | 'trial' | 'training';

/** What a dialog button does. The game carries these out. */
export type NextStep = 'menu' | 'trial' | 'restart' | 'stay';

export interface NextStepChoice {
  id: NextStep;
  label: string;
  isPrimary?: boolean;
}

/** What a mode may use from the game. Keeps modes free of scene, DOM and rendering. */
export interface ModeHost {
  readonly flight: FlightModel;
  readonly battery: Battery;
  readonly tracker: LapTracker;
  readonly gates: readonly Gate[];
  /** The landing pad: where free flight starts and batteries are swapped. */
  readonly padPose: Pose;
  groundY(x: number, z: number): number;
  /** Put the drone at a pose, at rest, and snap the camera. */
  placeDrone(pose: Pose): void;
  /** Show a centre-screen message for a few seconds. */
  flashBanner(title: string, subtitle: string, kind: 'info' | 'crash', seconds: number): void;
  hideBanner(): void;
  /** Show a "what next?" dialog. The mouse is released while it is open; picking an option carries it out. */
  offerNextSteps(title: string, subtitle: string, choices: readonly NextStepChoice[]): void;
  /** A new personal best lap was set (for uploading). */
  reportBestLap(lap: { lapTimeS: number; splitsS: number[]; ghost: GhostData }): void;
}

export interface RaceHud {
  lap: number;
  lapTimeS: number;
  lastLapS: number | null;
  bestLapS: number | null;
  /** Gap to the best lap at the last gate, shown for a couple of seconds. Null when there is none to show. */
  splitDeltaS: number | null;
}

/** What the mode wants on screen. Updated in place, read by the HUD bridge. */
export interface ModeHud {
  modeLabel: string;
  hint: string;
  /** Null outside time trial. */
  race: RaceHud | null;
  /** "3", "2", "1", "GO", or "" when there is no countdown. */
  countdown: string;
  /** 0..1 progress of a battery swap on the pad. */
  swapProgress01: number;
  /** The training checklist, or null outside training. */
  lesson: LessonPanelState | null;
  /** Name shown above the ghost: "Best lap", or the pilot being raced. */
  ghostLabel: string;
}

/** What the game tells a mode each frame, after the physics step. */
export interface ModeFrame {
  isLanded: boolean;
}

export interface GameMode {
  readonly id: ModeId;
  readonly hud: ModeHud;
  /** True while the pilot's input must be ignored (countdown, run over). */
  readonly isInputLocked: boolean;
  /** False when the battery should not drain (free flight with drain turned off). */
  readonly drainsBattery: boolean;
  /** Where the best-lap ghost is now, or false when there is none to show. */
  ghostPose(outPosition: Vector3, outQuaternion: Quaternion): boolean;
  start(): void;
  update(dtS: number, frame: ModeFrame): void;
  /** The drone passed through gate `index` (any gate; the tracker decides if it counts). */
  onGateCrossed(index: number): void;
  /** Pose to use after a crash or reset. */
  respawnPose(out: Pose): Pose;
  /** The reset key was pressed. Returns true when the mode handled it (for example restarting a finished run). */
  handleReset(): boolean;
}
