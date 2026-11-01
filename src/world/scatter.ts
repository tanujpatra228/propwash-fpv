import { SCENERY } from '../config';
import { heightAt } from './terrain';
import { track } from './track';

/** Circles where scenery must not be placed (factory, pit area, houses). */
export class Exclusions {
  private readonly circles: Array<{ x: number; z: number; r: number }> = [];

  add(x: number, z: number, radiusM: number): void {
    this.circles.push({ x, z, r: radiusM });
  }

  isBlocked(x: number, z: number): boolean {
    for (const c of this.circles) if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
    return false;
  }
}

/** Ground slope as rise over run, measured over `sampleM` either side. */
export function slopeAt(x: number, z: number, sampleM: number): number {
  const dx = heightAt(x + sampleM, z) - heightAt(x - sampleM, z);
  const dz = heightAt(x, z + sampleM) - heightAt(x, z - sampleM);
  return Math.hypot(dx, dz) / (2 * sampleM);
}

/** Random points over the valley that pass `test` (which returns the placed data, or null to reject). */
export function scatter<T>(count: number, rng: () => number, test: (x: number, z: number) => T | null): T[] {
  const out: T[] = [];
  const half = SCENERY.scatterHalfSizeM;
  let tries = 0;
  while (out.length < count && tries < count * 8) {
    tries++;
    const result = test((rng() * 2 - 1) * half, (rng() * 2 - 1) * half);
    if (result !== null) out.push(result);
  }
  return out;
}

export function distanceToTrack(x: number, z: number): number {
  return track.distanceToLineXZ(x, z);
}
