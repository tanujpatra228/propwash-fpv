import { Vector3 } from 'three';
import { GLACIER } from '../config';
import { sharedTimeS } from '../core/shared-clock';
import { windAt } from '../world/wind';
import type { DroneStats } from '../drone/drone-stats';
import type { Battery } from '../drone/battery';
import { NO_INPUT, type FlightInput, type FlightModel } from '../drone/flight-model';
import { clampToWorld } from '../physics/bounds';
import type { ColliderWorld } from '../physics/colliders';
import { resolveDrone, substepCount, type CrashReason } from '../physics/resolve';
import { checkGateCrossing } from '../world/gate-crossing';
import type { Gate } from '../world/gates';
import { surfaceAt } from '../world/terrain';
import type { LapTracker } from './lap-tracker';

const previousPosition = new Vector3();
const stepInput: FlightInput = { ...NO_INPUT };
const windAccel = { x: 0, y: 0, z: 0 };
const windMps = { x: 0, z: 0 };

/** The air the drone is flying in right now (what it feels), for the wind gauge. Zero when wind is off or absent. */
export const feltWind = { x: 0, z: 0 };

/** Moves the drone: flight physics, world walls, collisions, gate crossings and battery drain. No drawing, no UI. */
export class Simulation {
  constructor(
    private readonly flight: FlightModel,
    private readonly battery: Battery,
    private readonly colliders: ColliderWorld,
    private readonly gates: readonly Gate[],
    private readonly tracker: LapTracker,
    /** The stats in force right now (they depend on the mode and the equipped parts). */
    private readonly stats: () => DroneStats,
  ) {}

  /**
   * Advances one frame in small sub-steps so the drone can't tunnel through thin gate bars, checking collisions and
   * gate crossings after each. Returns the crash reason, if any.
   */
  step(input: Readonly<FlightInput>, dtS: number, drainsBattery: boolean, isWindOn: boolean, onGateCrossed: (gateIndex: number) => void): CrashReason | null {
    const steps = substepCount(this.flight.velocity.length(), dtS);
    const subDtS = dtS / steps;
    let effortSum = 0;
    for (let i = 0; i < steps; i++) {
      previousPosition.copy(this.flight.position);
      Object.assign(stepInput, input);
      stepInput.mouseYawRad = input.mouseYawRad / steps;
      let wind: typeof windMps | undefined;
      feltWind.x = 0;
      feltWind.z = 0;
      if (isWindOn) {
        windAt(this.flight.position.x, this.flight.position.z, sharedTimeS(), windAccel);
        windMps.x = windAccel.x * GLACIER.wind.metresPerSecondPerStrength;
        windMps.z = windAccel.z * GLACIER.wind.metresPerSecondPerStrength;
        wind = windMps;
        feltWind.x = windMps.x;
        feltWind.z = windMps.z;
      }
      effortSum += this.flight.step(stepInput, this.stats(), this.battery.powerFactor, subDtS, wind);

      clampToWorld(this.flight);
      const result = resolveDrone(this.flight, this.colliders, surfaceAt, subDtS);
      if (result.crashed && result.reason) return result.reason;

      const next = this.gates[this.tracker.nextGate];
      if (next && checkGateCrossing(next, previousPosition, this.flight.position)) onGateCrossed(next.index);
    }
    if (drainsBattery) this.battery.step(effortSum / steps, dtS);
    return null;
  }
}
