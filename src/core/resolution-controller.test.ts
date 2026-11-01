import { describe, expect, it } from 'vitest';
import { ResolutionController } from './resolution-controller';

describe('ResolutionController', () => {
  it('stays sharp at a steady 60', () => {
    const c = new ResolutionController();
    for (let i = 0; i < 20; i++) expect(c.update(60)).toBeNull();
    expect(c.scale).toBe(1);
  });

  it('lowers the resolution while the frame rate is under target, down to the floor', () => {
    const c = new ResolutionController();
    expect(c.update(47)).toBeCloseTo(0.93);
    for (let i = 0; i < 20; i++) c.update(40);
    expect(c.scale).toBeCloseTo(0.6);
    expect(c.update(40)).toBeNull(); // already at the floor
  });

  it('raises it again only after several good seconds in a row', () => {
    const c = new ResolutionController();
    c.update(45);
    c.update(45); // 0.86
    expect(c.update(60)).toBeNull();
    expect(c.update(60)).toBeNull();
    expect(c.update(60)).toBeNull();
    expect(c.update(60)).toBeCloseTo(0.9);
    expect(c.scale).toBeLessThanOrEqual(1);
  });

  it('does not creep back up when a dip interrupts the good run', () => {
    const c = new ResolutionController();
    c.update(45);
    const lowered = c.scale;
    c.update(60);
    c.update(60);
    c.update(57); // in between: neither lower nor count as good
    c.update(60);
    c.update(60);
    c.update(60);
    expect(c.scale).toBe(lowered);
  });

  it('never goes above full resolution and can be reset', () => {
    const c = new ResolutionController();
    c.update(50);
    for (let i = 0; i < 200; i++) c.update(60);
    expect(c.scale).toBe(1);
    c.update(30);
    c.reset();
    expect(c.scale).toBe(1);
  });
});
