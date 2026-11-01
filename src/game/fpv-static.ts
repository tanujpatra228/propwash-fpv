import { LENS } from '../config';
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
