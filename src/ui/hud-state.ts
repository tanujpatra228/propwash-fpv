import type { StandingRow } from './standings-panel';
import type { WindState } from './wind-gauge';
import type { LessonPanelState } from './lesson-panel';
import type { RacePanelState } from './race-panel';

/** Another pilot, ready to draw: world position for the minimap, clamped screen position for the pin. */
export interface HudOther {
  name: string;
  /** 0xRRGGBB. */
  color: number;
  /** Wears the crown (crown chase): drawn gold. */
  isKing: boolean;
  x: number;
  z: number;
  /** Normalised device coordinates of the tag, a little above the drone. */
  ndcX: number;
  ndcY: number;
  distM: number;
  /** True when the pilot is in front of the camera and inside the screen: only then is a name tag drawn. */
  isOnScreen: boolean;
  /** 1 when close, fading with distance so far pilots are quieter. */
  opacity01: number;
}

/** Everything the HUD shows, as plain numbers. The game builds one per frame; the HUD never reads game internals. */
export interface HudState {
  isGoggles: boolean;
  /** Display units for speed, height and distance. */
  units: 'metric' | 'imperial';
  /** The goggles camera's tilt and field of view, so the artificial horizon stays right. */
  uptiltDeg: number;
  fovDeg: number;
  speedMps: number;
  heightM: number;
  throttle01: number;
  flightTimeS: number;
  voltage: number;
  mAhUsed: number;
  charge01: number;
  /** Seconds of battery left at the recent average draw. Infinity when drain is off. */
  timeLeftS: number;
  isBatteryLow: boolean;
  isBatteryEmpty: boolean;
  /** Attitude, for the artificial horizon. */
  rollRad: number;
  pitchRad: number;
  gatesPassed: number;
  gateCount: number;
  /** Next gate on screen: normalised device coordinates, already pushed to the screen edge when off-screen. */
  nextGate: { x: number; y: number; distM: number };
  /** Drone on the minimap: world X, Z and heading (rotation about Y). */
  map: { x: number; z: number; yawRad: number };
  /** The wind gauge. Hidden on maps without wind. */
  wind: WindState;
  /** Other pilots in a live race (empty otherwise). */
  others: HudOther[];
  /** The best-lap ghost on screen (NDC), when it is shown and visible. */
  ghost: { isVisible: boolean; x: number; y: number };
  mode: {
    label: string;
    hint: string;
    /** Null outside time trial. */
    race: RacePanelState | null;
    countdown: string;
    swapProgress01: number;
    lesson: LessonPanelState | null;
    /** Live race order, or null outside a live race. */
    standings: readonly StandingRow[] | null;
  };
}
