import { describe, expect, it } from 'vitest';
import { PARTS } from '../config';
import { Progress } from './progress';

describe('Progress', () => {
  it('starts with stock parts and no credits', () => {
    const p = new Progress();
    expect(p.credits).toBe(0);
    expect(p.setup).toMatchObject({ prop: 'allround', battery: 'standard', propLevel: 1 });
  });
  it('earns credits per reason', () => {
    const p = new Progress();
    expect(p.earn('lap', 3)).toBe(3 * PARTS.credits.perLap);
    p.earn('personalBest');
    expect(p.credits).toBe(30 + 50);
  });
  it('rejects a purchase without enough credits and keeps the balance', () => {
    const p = new Progress();
    p.earn('lap');
    const r = p.buy('hauler');
    expect(r).toMatchObject({ ok: false });
    expect(p.credits).toBe(10);
    expect(p.owns('hauler')).toBe(false);
  });
  it('buys, equips and upgrades', () => {
    const p = new Progress();
    p.earn('star', 5);
    expect(p.buy('swift').ok).toBe(true);
    expect(p.credits).toBe(200);
    expect(p.equip('swift').ok).toBe(true);
    expect(p.setup.prop).toBe('swift');
    expect(p.upgrade('swift').ok).toBe(true);
    expect(p.levelOf('swift')).toBe(2);
    expect(p.setup.propLevel).toBe(2);
    expect(p.credits).toBe(50);
    expect(p.upgrade('swift')).toMatchObject({ ok: false });
  });
  it('cannot equip, upgrade or double-buy what it does not own', () => {
    const p = new Progress();
    p.earn('star', 10);
    expect(p.equip('grip')).toMatchObject({ ok: false });
    expect(p.upgrade('grip')).toMatchObject({ ok: false });
    p.buy('grip');
    expect(p.buy('grip')).toMatchObject({ ok: false });
  });
  it('tops out at level 3', () => {
    const p = new Progress();
    p.earn('star', 20);
    p.upgrade('allround');
    p.upgrade('allround');
    expect(p.levelOf('allround')).toBe(3);
    expect(p.upgrade('allround')).toMatchObject({ ok: false });
  });
  it('saves after every change and survives a reload from the saved state', () => {
    let saved: unknown = null;
    const p = new Progress(undefined, (s) => void (saved = structuredClone(s)));
    p.earn('star', 4);
    p.buy('light');
    p.equip('light');
    const again = new Progress(saved as never);
    expect(again.credits).toBe(200);
    expect(again.setup.battery).toBe('light');
  });
});
