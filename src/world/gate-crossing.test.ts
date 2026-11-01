import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { checkGateCrossing, createGatePlane } from './gate-crossing';

// A gate at the origin facing -Z (the way a drone flies by default).
const gate = createGatePlane(new Vector3(0, 5, 0), new Vector3(0, 0, -1));

describe('checkGateCrossing', () => {
  it('counts a pass through the centre, front to back', () => {
    expect(checkGateCrossing(gate, new Vector3(0, 5, 3), new Vector3(0, 5, -3))).toBe(true);
  });

  it('ignores a pass from behind', () => {
    expect(checkGateCrossing(gate, new Vector3(0, 5, -3), new Vector3(0, 5, 3))).toBe(false);
  });

  it('ignores a pass 0.5 m outside the opening', () => {
    const edge = 4.2 / 2 + 0.5;
    expect(checkGateCrossing(gate, new Vector3(edge, 5, 3), new Vector3(edge, 5, -3))).toBe(false);
  });

  it('ignores passes above or below the opening', () => {
    expect(checkGateCrossing(gate, new Vector3(0, 7, 3), new Vector3(0, 7, -3))).toBe(false);
    expect(checkGateCrossing(gate, new Vector3(0, 3, 3), new Vector3(0, 3, -3))).toBe(false);
  });

  it('counts a diagonal pass that crosses the plane inside the opening', () => {
    expect(checkGateCrossing(gate, new Vector3(-6, 5, 6), new Vector3(2, 5, -2))).toBe(true);
  });

  it('never skips the gate at very high speed', () => {
    expect(checkGateCrossing(gate, new Vector3(0, 5, 40), new Vector3(0, 5, -40))).toBe(true);
  });

  it('works for a gate facing another direction', () => {
    const east = createGatePlane(new Vector3(10, 2, 10), new Vector3(1, 0, 0));
    expect(checkGateCrossing(east, new Vector3(7, 2, 10.5), new Vector3(13, 2, 10.5))).toBe(true);
    expect(checkGateCrossing(east, new Vector3(13, 2, 10.5), new Vector3(7, 2, 10.5))).toBe(false);
  });

  it('ignores a segment that stops before the plane', () => {
    expect(checkGateCrossing(gate, new Vector3(0, 5, 3), new Vector3(0, 5, 1))).toBe(false);
  });
});
