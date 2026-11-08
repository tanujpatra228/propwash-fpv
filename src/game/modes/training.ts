import type { Quaternion, Vector3 } from 'three';
import { COLLISION, TRAINING } from '../../config';
import { respawnPose, type Pose } from '../respawn';
import type { GameMode, ModeFrame, ModeHost, ModeHud } from './mode';
import { LESSONS, LessonRunner, type LessonFrame } from './training-lessons';

/** Lessons 1 to 4 happen around the pad; from lesson 5 on the gates matter. */
const FIRST_GATE_LESSON_INDEX = 4;

export interface ProgressStore {
  /** How many lessons are finished. */
  load(): number;
  save(completed: number): void;
}

const frameSnapshot: LessonFrame = { dtS: 0, heightM: 0, speedMps: 0, distanceFromPadM: 0, isLanded: false, yawRad: 0, lastPassedGate: -1 };

/** Six short lessons with an on-screen checklist. No battery drain; crashes respawn on the pad or at the last gate. */
export class TrainingMode implements GameMode {
  readonly id = 'training' as const;
  readonly isInputLocked = false;
  readonly usesSetup = false;
  readonly drainsBattery = false;
  readonly hud: ModeHud = { modeLabel: 'Training', hint: '', race: null, countdown: '', swapProgress01: 0, lesson: null, standings: null, ghostLabel: 'Best lap' };
  private lessonIndex = 0;
  private runner: LessonRunner = new LessonRunner(LESSONS[0]!);
  private nextLessonInS = 0;
  private isAllDone = false;

  constructor(
    private readonly host: ModeHost,
    private readonly store: ProgressStore,
  ) {}

  ghostPose(_position: Vector3, _quaternion: Quaternion): boolean {
    return false;
  }

  start(): void {
    const completed = this.store.load();
    // Resume at the first unfinished lesson; after finishing everything, start over.
    this.lessonIndex = completed >= LESSONS.length ? 0 : completed;
    this.isAllDone = false;
    this.host.battery.refill();
    this.host.placeDrone(this.host.padPose);
    this.host.hideBanner();
    this.beginLesson();
  }

  private beginLesson(): void {
    const lesson = LESSONS[this.lessonIndex];
    if (!lesson) return;
    this.runner = new LessonRunner(lesson);
    this.nextLessonInS = 0;
    this.host.tracker.reset();
    this.refreshHud();
  }

  private refreshHud(): void {
    this.hud.lesson = {
      number: this.lessonIndex + 1,
      total: LESSONS.length,
      title: this.runner.title,
      steps: this.runner.steps,
    };
  }

  update(dtS: number, frame: ModeFrame): void {
    if (this.nextLessonInS > 0) {
      this.nextLessonInS -= dtS;
      if (this.nextLessonInS <= 0) {
        this.lessonIndex++;
        this.beginLesson();
      }
      return;
    }
    if (this.isAllDone) return;

    const { flight, padPose, tracker } = this.host;
    const f = frameSnapshot;
    f.dtS = dtS;
    f.heightM = Math.max(0, flight.position.y - this.host.groundY(flight.position.x, flight.position.z) - COLLISION.restOffsetM);
    f.speedMps = flight.velocity.length();
    f.distanceFromPadM = Math.hypot(flight.position.x - padPose.position.x, flight.position.z - padPose.position.z);
    f.isLanded = frame.isLanded;
    f.yawRad = flight.yawRad;
    f.lastPassedGate = tracker.lastPassedGate;

    const justCompleted = this.runner.update(f);
    this.refreshHud();
    if (justCompleted) this.finishLesson();
  }

  private finishLesson(): void {
    const finished = this.lessonIndex + 1;
    this.store.save(Math.max(this.store.load(), finished));
    if (finished >= LESSONS.length) {
      this.isAllDone = true;
      this.host.offerNextSteps('Training complete', 'You can take off, hover, land, turn and fly the gates.', [
        { id: 'menu', label: 'Back to menu', isPrimary: true },
        { id: 'trial', label: 'Try a time trial' },
        { id: 'stay', label: 'Keep flying' },
      ]);
      return;
    }
    this.host.flashBanner('Lesson complete', `Next: ${LESSONS[finished]?.title ?? ''}`, 'info', TRAINING.lessonCompleteShownS);
    this.nextLessonInS = TRAINING.nextLessonDelayS;
  }

  onGateCrossed(index: number): void {
    this.host.tracker.onGateCrossed(index, 0); // order and the respawn point matter here, not time
  }

  respawnPose(out: Pose): Pose {
    if (this.lessonIndex < FIRST_GATE_LESSON_INDEX) {
      out.position.copy(this.host.padPose.position);
      out.yawRad = this.host.padPose.yawRad;
      return out;
    }
    return respawnPose(this.host.gates, this.host.tracker.respawnGate, this.host.padPose, this.host.groundY, out);
  }

  handleReset(): boolean {
    return false;
  }
}
