import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { broadcastShot, SHOT_ORDER } from './broadcast-shots';

const subject = new Vector3(10, 5, 20);
const forward = new Vector3(0, 0, -1); // flying toward -Z
const ahead = new Vector3(10, 6, -100);

function shot(kind: Parameters<typeof broadcastShot>[0]) {
  const position = new Vector3();
  const lookAt = new Vector3();
  broadcastShot(kind, subject, forward, ahead, position, lookAt);
  return { position, lookAt };
}

describe('broadcastShot', () => {
  it('always looks at the racer', () => {
    for (const kind of SHOT_ORDER) expect(shot(kind).lookAt.equals(subject)).toBe(true);
  });

  it('chase sits behind and above', () => {
    const { position } = shot('chase');
    expect(position.z).toBeGreaterThan(subject.z); // behind a racer heading -Z
    expect(position.distanceTo(subject)).toBeGreaterThan(6);
    expect(position.y).toBeGreaterThan(subject.y);
  });

  it('side sits off to the side at the same distance along the track', () => {
    const { position } = shot('side');
    expect(position.z).toBeCloseTo(subject.z);
    expect(Math.abs(position.x - subject.x)).toBeCloseTo(13);
  });

  it('trackside is near the point ahead, not near the racer', () => {
    const { position } = shot('trackside');
    expect(position.distanceTo(ahead)).toBeLessThan(15);
    expect(position.distanceTo(subject)).toBeGreaterThan(100);
  });
});
