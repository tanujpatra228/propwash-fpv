import { COLLISION } from '../config';
import { NO_INPUT, type FlightInput, type FlightModel } from '../drone/flight-model';
import type { CrashReason } from '../physics/resolve';
import { groundY } from '../world/terrain';
import { CRASH_MESSAGES } from './crash-messages';
import type { GameMode } from './modes/mode';
import type { Pose } from './respawn';
import type { Simulation } from './simulation';
import { Vector3 } from 'three';

const RESTING_ON_GROUND_M = 0.02;
const respawn: Pose = { position: new Vector3(), yawRad: 0 };

/** What the flight session needs around it: the camera snap, the banner, and which mode is active. */
export interface FlightSessionParts {
  flight: FlightModel;
  simulation: Simulation;
  snapCamera(): void;
  showCrash(title: string, subtitle: string): void;
  hideBanner(): void;
  currentMode(): GameMode;
}

/** The drone in play: stepping the physics, crash freeze and respawn, placing and landing checks. */
export class FlightSession {
  /** Seconds left in the crash freeze, or 0. */
  crashTimerS = 0;

  constructor(private readonly parts: FlightSessionParts) {}

  /** Puts the drone at a pose, at rest and clear of the ground, and ends any crash freeze. */
  placeDrone(pose: Pose): void {
    const { flight } = this.parts;
    flight.reset(pose.position, pose.yawRad);
    const floorY = groundY(pose.position.x, pose.position.z) + COLLISION.restOffsetM;
    if (flight.position.y < floorY) flight.position.y = floorY;
    this.crashTimerS = 0;
    this.parts.snapCamera();
  }

  respawnAtLastGate(): void {
    this.parts.currentMode().respawnPose(respawn);
    this.placeDrone(respawn);
    this.parts.hideBanner();
  }

  private startCrash(reason: CrashReason): void {
    this.crashTimerS = COLLISION.crashDurationS;
    this.parts.flight.velocity.set(0, 0, 0);
    this.parts.showCrash('Crashed', `${CRASH_MESSAGES[reason]}. Respawning at the last gate…`);
  }

  simulate(input: Readonly<FlightInput>, dtS: number): CrashReason | null {
    const mode = this.parts.currentMode();
    return this.parts.simulation.step(input, dtS, mode.drainsBattery, (index) => mode.onGateCrossed(index));
  }

  isLanded(): boolean {
    const { position } = this.parts.flight;
    return position.y <= groundY(position.x, position.z) + COLLISION.restOffsetM + RESTING_ON_GROUND_M;
  }

  /** One frame of flying: run down the crash freeze, or step the physics with the pilot's input (ignored while locked). */
  advance(dtS: number, pilot: Readonly<FlightInput>): void {
    if (this.crashTimerS > 0) {
      this.crashTimerS -= dtS;
      if (this.crashTimerS <= 0) this.respawnAtLastGate();
      return;
    }
    const crash = this.simulate(this.parts.currentMode().isInputLocked ? NO_INPUT : pilot, dtS);
    if (crash) this.startCrash(crash);
  }
}
