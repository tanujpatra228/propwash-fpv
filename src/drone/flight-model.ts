import { Euler, Quaternion, Vector3 } from 'three';
import { FLIGHT, LOOP } from '../config';
import { clamp, clamp01, damp, valueNoise } from '../core/math';
import { STOCK_MASS_KG, type DroneStats } from './drone-stats';

/** One frame of pilot input. Digital keys are 0 or 1; mouseYawRad is positive to turn left. */
export interface FlightInput {
  forward: number;
  back: number;
  left: number;
  right: number;
  up: number;
  down: number;
  turnLeft: number;
  turnRight: number;
  mouseYawRad: number;
  /** Drag fallback, -1..1. stickX positive turns right; stickY negative flies forward. */
  stickX: number;
  stickY: number;
}

export const NO_INPUT: Readonly<FlightInput> = {
  forward: 0, back: 0, left: 0, right: 0, up: 0, down: 0,
  turnLeft: 0, turnRight: 0, mouseYawRad: 0, stickX: 0, stickY: 0,
};

const euler = new Euler(0, 0, 0, 'YXZ');

/**
 * Beginner "angle mode": real tilt-and-thrust physics sideways, altitude hold vertically.
 * Pure motion only: collisions and ground response are applied afterwards by physics/.
 */
export class FlightModel {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly quaternion = new Quaternion();
  yawRad = 0;
  pitchRad = 0;
  rollRad = 0;
  yawRateRadps = 0;
  throttle01 = 0;
  private clockS = 0;

  reset(position: Vector3, yawRad: number): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yawRad = yawRad;
    this.pitchRad = 0;
    this.rollRad = 0;
    this.yawRateRadps = 0;
    this.throttle01 = 0;
    this.updateQuaternion();
  }

  /** Adopt an externally given pose (respawn, replay). Yaw is read back from the quaternion. */
  setFromPose(position: Vector3, quaternion: Quaternion, velocity: Vector3): void {
    this.position.copy(position);
    this.velocity.copy(velocity);
    euler.setFromQuaternion(quaternion, 'YXZ');
    this.pitchRad = euler.x;
    this.yawRad = euler.y;
    this.rollRad = euler.z;
    this.yawRateRadps = 0;
    this.updateQuaternion();
  }

  /** Advances one frame. Returns effort 0..1, the battery's input for current draw. */
  step(rawInput: FlightInput, stats: DroneStats, powerFactor: number, rawDtS: number): number {
    const dtS = clamp(Number.isFinite(rawDtS) ? rawDtS : 0, LOOP.minDtS, LOOP.maxDtS);
    this.clockS += dtS;
    const isPowered = powerFactor > 0;
    const input = isPowered ? rawInput : NO_INPUT;

    const topSpeedSq = stats.topSpeedFactor * stats.topSpeedFactor;
    const dragQuadratic = FLIGHT.dragQuadratic / topSpeedSq;
    const dragLinear = FLIGHT.dragLinear / topSpeedSq;
    const thrustScale = (stats.liftFactor * STOCK_MASS_KG) / stats.massKg;
    const gripTurn = 0.85 + 0.15 * stats.gripFactor;

    const forwardAxis = clamp(input.forward - input.back - input.stickY, -1, 1);
    const sideAxis = input.right - input.left;
    const climbAxis = input.up - input.down;

    // Yaw: keys, drag stick and mouse. Mouse delta is already an angle for this frame.
    const keyTurn = input.turnLeft - input.turnRight - input.stickX;
    const yawDeltaRad = keyTurn * FLIGHT.keyboardTurnRateRadps * gripTurn * dtS + input.mouseYawRad;
    this.yawRad += yawDeltaRad;
    this.yawRateRadps = damp(this.yawRateRadps, yawDeltaRad / dtS, FLIGHT.yawRateSmoothingPerS, dtS);

    // Lean into turns when moving, like a real pilot would.
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const bankRad =
      clamp(this.yawRateRadps * FLIGHT.autoBankGain, -FLIGHT.autoBankMaxRad, FLIGHT.autoBankMaxRad) *
      clamp01(horizontalSpeed / FLIGHT.autoBankFullEffectSpeedMps);

    const wobbleRad = FLIGHT.wobbleMaxRad * stats.wobble;
    const wobblePitch = wobbleRad * valueNoise(this.clockS * FLIGHT.wobbleRateHz, 11.5);
    const wobbleRoll = wobbleRad * valueNoise(this.clockS * FLIGHT.wobbleRateHz, 47.2);

    const tiltRate = FLIGHT.tiltResponsePerS * stats.gripFactor;
    this.pitchRad = damp(this.pitchRad, -forwardAxis * FLIGHT.maxTiltRad + wobblePitch, tiltRate, dtS);
    this.rollRad = damp(this.rollRad, -sideAxis * FLIGHT.maxTiltRad + bankRad + wobbleRoll, tiltRate, dtS);
    this.updateQuaternion();

    // Local up vector of the drone (the thrust direction).
    const upX = 2 * (this.quaternion.x * this.quaternion.y - this.quaternion.w * this.quaternion.z);
    const upY = 1 - 2 * (this.quaternion.x * this.quaternion.x + this.quaternion.z * this.quaternion.z);
    const upZ = 2 * (this.quaternion.y * this.quaternion.z + this.quaternion.w * this.quaternion.x);

    if (isPowered) {
      const thrust = (FLIGHT.gravityMps2 / Math.max(FLIGHT.minUpY, upY)) * thrustScale * powerFactor;
      this.velocity.x += upX * thrust * dtS;
      this.velocity.z += upZ * thrust * dtS;
      const climbRate = climbAxis > 0 ? FLIGHT.climbRateMps * powerFactor : FLIGHT.descendRateMps;
      const targetVy = climbAxis * climbRate * thrustScale;
      this.velocity.y = damp(this.velocity.y, targetVy, FLIGHT.verticalResponsePerS, dtS);
    } else {
      // Motors cut: gravity and drag only.
      this.velocity.y -= FLIGHT.gravityMps2 * dtS;
    }

    const speed = this.velocity.length();
    const dragPerS = dragQuadratic * speed + dragLinear;
    const dragKeep = Math.exp(-dragPerS * dtS);
    this.velocity.x *= dragKeep;
    this.velocity.z *= dragKeep;
    if (!isPowered) this.velocity.y *= dragKeep;

    // Beginner assist: bleed off sideways drift so turns follow the nose (off while sliding on purpose).
    if (isPowered && sideAxis === 0) {
      const sideX = Math.cos(this.yawRad);
      const sideZ = -Math.sin(this.yawRad);
      const sideSpeed = this.velocity.x * sideX + this.velocity.z * sideZ;
      const bleed = Math.min(1, FLIGHT.driftAssistPerS * stats.gripFactor * dtS) * sideSpeed;
      this.velocity.x -= sideX * bleed;
      this.velocity.z -= sideZ * bleed;
    }

    this.position.addScaledVector(this.velocity, dtS);

    const tiltRad = Math.acos(clamp(upY, -1, 1));
    const speedRatio = Math.min(1.5, speed / FLIGHT.topSpeedMps);
    const effort = clamp01(
      0.45 * (tiltRad / FLIGHT.maxTiltRad) + 0.35 * Math.max(0, climbAxis) + 0.2 * speedRatio * speedRatio,
    );
    const throttleTarget = isPowered ? clamp01(0.35 + 0.35 * climbAxis + 0.3 * Math.min(1, speed / FLIGHT.topSpeedMps)) : 0;
    this.throttle01 = damp(this.throttle01, throttleTarget, FLIGHT.throttleResponsePerS, dtS);
    return isPowered ? effort : 0;
  }

  private updateQuaternion(): void {
    euler.set(this.pitchRad, this.yawRad, this.rollRad, 'YXZ');
    this.quaternion.setFromEuler(euler);
  }
}
