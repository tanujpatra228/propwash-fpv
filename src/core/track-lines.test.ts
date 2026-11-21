import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACK_DEFS, TRACK_IDS, type TrackId } from '../config';
import { TRACK_LINES } from './track-lines';

afterEach(() => {
  delete (globalThis as { location?: unknown }).location;
});

/** Loads the real track of a map (the world module reads the map once at start-up, so each map needs fresh modules). */
async function realTrack(id: TrackId) {
  vi.resetModules();
  (globalThis as { location?: unknown }).location = { search: `?track=${id}` };
  return import('../world/track');
}

function distanceToLine(line: readonly number[], x: number, y: number, z: number): number {
  let best = Infinity;
  const n = line.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = line[i * 3]!, ay = line[i * 3 + 1]!, az = line[i * 3 + 2]!;
    const bx = line[j * 3]!, by = line[j * 3 + 1]!, bz = line[j * 3 + 2]!;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t), z - (az + dz * t)));
  }
  return best;
}

describe('track lines', () => {
  it.each(TRACK_IDS)('the saved line of %s is the real racing line (regenerate track-lines.ts if the track changed)', async (id) => {
    const { track, gateSampleIndex } = await realTrack(id);
    const saved = TRACK_LINES[TRACK_DEFS[id].family];
    expect(saved.lengthM).toBeCloseTo(track.lengthM, 0);
    expect(saved.gate0M).toBeCloseTo(gateSampleIndex(0) * track.spacingM, 0);
    const every = Math.max(1, Math.round(8 / track.spacingM));
    const real: number[] = [];
    for (let i = 0; i < track.sampleCount; i += every) {
      const p = track.positions[i]!;
      real.push(p.x, p.y, p.z);
    }
    expect(saved.points).toHaveLength(real.length);
    for (let i = 0; i < real.length; i++) expect(Math.abs(saved.points[i]! - real[i]!)).toBeLessThan(0.06);
  });
  it.each(TRACK_IDS)('the crown point of %s is on the racing line, so a bot flying the line can claim the crown', (id) => {
    const [x, y, z] = TRACK_DEFS[id].crownSpawn;
    expect(distanceToLine(TRACK_LINES[TRACK_DEFS[id].family].points, x, y, z)).toBeLessThan(4);
  });
});
