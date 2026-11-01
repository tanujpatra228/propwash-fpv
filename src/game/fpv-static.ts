import { LENS, TRACK, VALLEY } from '../config';
import type { Vector3 } from 'three';
import { PIT_PAD } from '../world/pit-area';
import type { LensSettings } from '../core/fpv-shader';
import { clamp01, smoothstep } from '../core/math';

export interface StaticInputs {
  isGoggles: boolean;
  isAnalogOn: boolean;
  distanceFromPadM: number;
  isInFactory: boolean;
  /** Seconds left of the crash freeze, 0 when flying. */
  crashRemainingS: number;
}

/** How much analog video static to show, 0..1. Pure game rule; the shader only draws the number. */
export function staticAmount(inputs: StaticInputs): number {
  let amount = 0;
  if (inputs.isGoggles && inputs.isAnalogOn) {
    const { startDistanceM, fullDistanceM, maxFromDistance, inFactory } = LENS.static;
    amount = smoothstep(startDistanceM, fullDistanceM, inputs.distanceFromPadM) * maxFromDistance;
    if (inputs.isInFactory) amount = Math.max(amount, inFactory);
  }
  if (inputs.crashRemainingS > 0) {
    amount = Math.max(amount, LENS.static.crashBase + inputs.crashRemainingS * LENS.static.crashPerRemainingS);
  }
  return clamp01(amount);
}

/** Full lens look for a frame: goggles get fisheye, vignette and analog grain; chase gets a light vignette. */
export function lensFor(isGoggles: boolean, isAnalogOn: boolean, staticValue: number): LensSettings {
  if (!isGoggles) {
    return { fisheye: LENS.flat.fisheye, vignette: LENS.flat.vignette, grain: LENS.flat.grain, staticAmount: staticValue };
  }
  return {
    fisheye: LENS.goggles.fisheye,
    vignette: LENS.goggles.vignette,
    grain: isAnalogOn ? LENS.goggles.grainAnalog : LENS.goggles.grainClean,
    staticAmount: staticValue,
  };
}

export interface FrameLensInputs {
  isGoggles: boolean;
  isAnalogOn: boolean;
  position: Vector3;
  crashRemainingS: number;
}

/** Lens look for the drone's current position: static grows away from the pits, inside the factory and in a crash. */
export function frameLens(inputs: FrameLensInputs): LensSettings {
  const { position } = inputs;
  const staticValue = staticAmount({
    isGoggles: inputs.isGoggles,
    isAnalogOn: inputs.isAnalogOn,
    distanceFromPadM: position.distanceTo(PIT_PAD.position),
    isInFactory: Math.hypot(position.x - VALLEY.bando.x, position.z - VALLEY.bando.z) < TRACK.bandoZoneRadiusM,
    crashRemainingS: inputs.crashRemainingS,
  });
  return lensFor(inputs.isGoggles, inputs.isAnalogOn, staticValue);
}
