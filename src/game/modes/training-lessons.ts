import { TRAINING } from '../../config';

/** A snapshot of the drone for judging lesson steps. Plain numbers, so lessons are easy to test. */
export interface LessonFrame {
  dtS: number;
  heightM: number;
  speedMps: number;
  distanceFromPadM: number;
  isLanded: boolean;
  /** Heading about Y in radians (wraps at plus and minus pi). */
  yawRad: number;
  /** Last gate passed in order, or -1. */
  lastPassedGate: number;
}

/** Remembers progress inside one step. `update` returns true once the step is done. */
export interface StepChecker {
  update(frame: LessonFrame): boolean;
}

export interface StepDef {
  text: string;
  create(): StepChecker;
}

export interface LessonDef {
  title: string;
  steps: StepDef[];
}

const TWO_PI = Math.PI * 2;

const reachHeight = (heightM: number): StepChecker => ({ update: (f) => f.heightM >= heightM });

/** Stay in the band (above `minHeightM`, slower than `maxSpeedMps`) for `seconds` in a row. */
function hoverFor(seconds: number, minHeightM: number, maxSpeedMps: number): StepChecker {
  let held = 0;
  return {
    update(f) {
      held = f.heightM > minHeightM && f.speedMps < maxSpeedMps ? held + f.dtS : 0;
      return held >= seconds;
    },
  };
}

const landOnPad = (): StepChecker => ({
  update: (f) =>
    f.isLanded && f.heightM < TRAINING.landMaxHeightM && f.distanceFromPadM < TRAINING.landMaxDistanceM && f.speedMps < TRAINING.landMaxSpeedMps,
});

const reachDistance = (distanceM: number): StepChecker => ({ update: (f) => f.distanceFromPadM >= distanceM });

/** A full circle in one direction (+1 = left, -1 = right), counted frame to frame so the angle's wrap does not matter. */
function turnCircle(direction: 1 | -1): StepChecker {
  let previous: number | null = null;
  let turned = 0;
  return {
    update(f) {
      if (previous !== null) {
        const delta = f.yawRad - previous;
        const wrapped = delta - TWO_PI * Math.round(delta / TWO_PI);
        turned += wrapped * direction > 0 ? Math.abs(wrapped) : 0;
      }
      previous = f.yawRad;
      return turned >= TWO_PI * 0.98;
    },
  };
}

const passGate = (gateIndex: number): StepChecker => ({ update: (f) => f.lastPassedGate >= gateIndex });

export const LESSONS: readonly LessonDef[] = [
  { title: 'Take off', steps: [{ text: `Hold up until you are ${TRAINING.takeoffHeightM} m above the ground`, create: () => reachHeight(TRAINING.takeoffHeightM) }] },
  {
    title: 'Hover and land',
    steps: [
      { text: `Rise to ${TRAINING.takeoffHeightM} m`, create: () => reachHeight(TRAINING.takeoffHeightM) },
      { text: `Hover for ${TRAINING.hoverForS} seconds without drifting`, create: () => hoverFor(TRAINING.hoverForS, TRAINING.hoverMinHeightM, TRAINING.hoverMaxSpeedMps) },
      { text: 'Land gently on the pad', create: landOnPad },
    ],
  },
  {
    title: 'Fly forward',
    steps: [
      { text: `Fly ${TRAINING.farFromPadM} m away from the pad`, create: () => reachDistance(TRAINING.farFromPadM) },
      { text: 'Fly back and land on the pad', create: landOnPad },
    ],
  },
  {
    title: 'Turn',
    steps: [
      { text: 'Turn a full circle to the left', create: () => turnCircle(1) },
      { text: 'Turn a full circle to the right', create: () => turnCircle(-1) },
    ],
  },
  { title: 'Your first gate', steps: [{ text: 'Fly through the start gate', create: () => passGate(0) }] },
  {
    title: 'A short course',
    steps: [{ text: `Fly through the first ${TRAINING.courseLastGate + 1} gates in order`, create: () => passGate(TRAINING.courseLastGate) }],
  },
];

export interface StepView {
  text: string;
  isDone: boolean;
}

/** Runs one lesson: steps are judged in order, and a finished step stays finished. */
export class LessonRunner {
  private readonly checkers: StepChecker[];
  private readonly done: boolean[];

  constructor(private readonly lesson: LessonDef) {
    this.checkers = lesson.steps.map((s) => s.create());
    this.done = lesson.steps.map(() => false);
  }

  get title(): string {
    return this.lesson.title;
  }

  get isComplete(): boolean {
    return this.done.every(Boolean);
  }

  get steps(): StepView[] {
    return this.lesson.steps.map((s, i) => ({ text: s.text, isDone: this.done[i] === true }));
  }

  /** Judges the first unfinished step. Returns true on the frame the whole lesson becomes complete. */
  update(frame: LessonFrame): boolean {
    if (this.isComplete) return false;
    const index = this.done.indexOf(false);
    if (index >= 0 && this.checkers[index]?.update(frame)) this.done[index] = true;
    return this.isComplete;
  }
}
