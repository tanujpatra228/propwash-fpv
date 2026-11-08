import type { Quaternion, Vector3 } from 'three';
import { COLLISION, FREE_FLIGHT } from '../../config';
import { respawnPose } from '../respawn';
import type { Pose } from '../respawn';
import type { GameMode, ModeFrame, ModeHost, ModeHud } from './mode';

const HINT = 'Fly anywhere. Click the view to steer with the mouse. Land on the pad for 2 s to swap the battery.';

/** No timer, no rules: explore the valley. Gates still count (they set your respawn point). */
export class FreeFlight implements GameMode {
  readonly id = 'free' as const;
  readonly isInputLocked = false;
  readonly hud: ModeHud = { modeLabel: 'Free flight', hint: HINT, race: null, countdown: '', swapProgress01: 0, lesson: null, standings: null, others: [], ghostLabel: 'Best lap' };
  private swapHeldS = 0;
  private emptyForS = 0;

  constructor(
    private readonly host: ModeHost,
    /** Setting: battery drain in free flight (on by default). */
    private readonly isDrainOn: () => boolean,
  ) {}

  readonly usesSetup = true;
  get drainsBattery(): boolean {
    return this.isDrainOn();
  }

  ghostPose(_position: Vector3, _quaternion: Quaternion): boolean {
    return false;
  }

  start(): void {
    this.host.tracker.reset();
    this.host.battery.refill();
    this.host.placeDrone(this.host.padPose);
    this.host.hideBanner();
    this.swapHeldS = 0;
    this.emptyForS = 0;
    this.hud.swapProgress01 = 0;
  }

  update(dtS: number, frame: ModeFrame): void {
    this.updateSwap(dtS, frame);
    this.updateEmptyBattery(dtS, frame);
  }

  /** Landed and still on the pad for long enough: fresh battery. */
  private updateSwap(dtS: number, frame: ModeFrame): void {
    const { swap } = FREE_FLIGHT;
    const { flight, padPose, battery } = this.host;
    const heightM = flight.position.y - this.host.groundY(flight.position.x, flight.position.z);
    const distanceM = Math.hypot(flight.position.x - padPose.position.x, flight.position.z - padPose.position.z);
    const isSettled =
      frame.isLanded && heightM < swap.maxHeightM + COLLISION.restOffsetM && distanceM < swap.maxDistanceM && flight.velocity.length() < swap.maxSpeedMps;
    if (!isSettled || battery.charge01 >= swap.skipAboveCharge01) {
      this.swapHeldS = 0;
      this.hud.swapProgress01 = 0;
      return;
    }
    this.swapHeldS += dtS;
    this.hud.swapProgress01 = Math.min(1, this.swapHeldS / swap.holdS);
    if (this.swapHeldS >= swap.holdS) {
      battery.refill();
      this.swapHeldS = 0;
      this.hud.swapProgress01 = 0;
      this.host.flashBanner('Fresh battery', 'Charged to 100%', 'info', 2);
    }
  }

  /** Empty battery: the drone falls; on touching down (or after a few seconds) it goes back to the pad with a fresh pack. */
  private updateEmptyBattery(dtS: number, frame: ModeFrame): void {
    if (!this.host.battery.isEmpty) {
      this.emptyForS = 0;
      return;
    }
    this.emptyForS += dtS;
    if (frame.isLanded || this.emptyForS >= FREE_FLIGHT.emptyBatteryGraceS) {
      this.host.battery.refill();
      this.host.placeDrone(this.host.padPose);
      this.host.flashBanner('Battery empty', 'Back on the pad with a fresh battery', 'info', 2.5);
      this.emptyForS = 0;
    }
  }

  onGateCrossed(index: number): void {
    this.host.tracker.onGateCrossed(index, 0); // timing is ignored here; only the order and the respawn point matter
  }

  respawnPose(out: Pose): Pose {
    return respawnPose(this.host.gates, this.host.tracker.respawnGate, this.host.padPose, this.host.groundY, out);
  }

  handleReset(): boolean {
    return false;
  }
}
