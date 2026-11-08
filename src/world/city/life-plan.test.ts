import { describe, expect, it } from 'vitest';
import { CITY } from '../../config';
import { birdPlacement, buildBirds, buildDeliveryDrones, buildPedestrians, deliveryPlacement, pedestrianPlacement, type Placement } from './life-plan';

const out = (): Placement => ({ x: 0, y: 0, z: 0, yawRad: 0 });

describe('life plan', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(buildBirds())).toBe(JSON.stringify(buildBirds()));
    expect(JSON.stringify(buildPedestrians())).toBe(JSON.stringify(buildPedestrians()));
  });
  it('birds move over time and stay inside the world', () => {
    const p = out();
    for (const bird of buildBirds()) {
      for (const t of [0, 20, 100, 777]) {
        birdPlacement(bird, t, p);
        expect(Math.abs(p.x)).toBeLessThan(330);
        expect(Math.abs(p.z)).toBeLessThan(330);
        expect(p.y).toBeGreaterThan(15);
      }
      const a = birdPlacement(bird, 0, out());
      const b = birdPlacement(bird, 5, out());
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    }
  });
  it('delivery drones stay over their avenue, inside the world and above the rooftops of low buildings', () => {
    const p = out();
    for (const d of buildDeliveryDrones()) {
      for (let t = 0; t < 400; t += 7) {
        deliveryPlacement(d, t, p);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(300);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(300);
        const across = d.alongZ ? p.x : p.z;
        expect(Math.abs(across - d.avenue)).toBeLessThanOrEqual(CITY.avenueWidthM / 2);
        expect(p.y).toBeGreaterThan(10);
      }
    }
  });
  it('pedestrians stay on the sidewalk ring of their block', () => {
    const p = out();
    const edge = CITY.blockHalfM - CITY.life.sidewalkInsetM;
    for (const ped of buildPedestrians()) {
      for (const t of [0, 13, 99, 1234]) {
        pedestrianPlacement(ped, t, p);
        const dx = Math.abs(p.x - ped.bx);
        const dz = Math.abs(p.z - ped.bz);
        expect(Math.max(dx, dz)).toBeCloseTo(edge, 5);
      }
    }
  });
});
