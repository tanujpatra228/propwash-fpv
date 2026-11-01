import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TRACK, VALLEY } from '../config';
import { heightAt } from './terrain';
import { gateSampleIndex, track } from './track';

describe('track', () => {
  it('is 1.0 to 1.2 km long', () => {
    expect(track.lengthM).toBeGreaterThan(1000);
    expect(track.lengthM).toBeLessThan(1200);
  });

  it('is a closed loop', () => {
    const first = track.positions[0]!;
    const last = track.positions[track.sampleCount - 1]!;
    expect(first.distanceTo(last)).toBeLessThan(track.spacingM * 2);
  });

  it('stays above the ground outside the factory', () => {
    for (const p of track.positions) {
      const isFactory = Math.hypot(p.x - VALLEY.bando.x, p.z - VALLEY.bando.z) < TRACK.bandoZoneRadiusM;
      if (isFactory) continue;
      expect(p.y - heightAt(p.x, p.z)).toBeGreaterThan(TRACK.minGroundClearanceM - 0.01);
    }
  });

  it('passes through the factory below the roof', () => {
    const { x, z } = VALLEY.bando;
    const i = track.nearestSampleIndex(new Vector3(x, 0, z));
    const p = track.positions[i]!;
    expect(p.y - heightAt(p.x, p.z)).toBeLessThan(9.2);
  });

  it('wraps u around the loop', () => {
    const a = track.sampleAt(0.25, new Vector3());
    const b = track.sampleAt(1.25, new Vector3());
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
  });

  it('poses a drone with a finite, level-ish orientation on straight sections', () => {
    const position = new Vector3();
    const quaternion = new Quaternion();
    for (let d = 0; d < track.lengthM; d += 50) {
      const up = track.poseAt(d, 0.5, 20, position, quaternion);
      expect(Number.isFinite(quaternion.x + quaternion.y + quaternion.z + quaternion.w)).toBe(true);
      expect(up.y).toBeGreaterThan(0.4); // never tilts beyond the flight model's limit
    }
  });

  it('spaces the gates evenly with gate 0 at the start', () => {
    expect(gateSampleIndex(0)).toBe(0);
    expect(gateSampleIndex(6)).toBe(track.sampleCount / 2);
  });

  it('measures distance to the racing line', () => {
    const p = track.positions[100]!;
    expect(track.distanceToLineXZ(p.x, p.z)).toBeLessThan(10);
    expect(track.distanceToLineXZ(5000, 5000)).toBeGreaterThan(1000);
  });
});
