import { describe, expect, it } from 'vitest';
import { CITY } from '../../config';
import { buildCityPlan, type CityBox } from './plan';

const plan = buildCityPlan();
const inside = (b: CityBox, x: number, y: number, z: number): boolean =>
  Math.abs(x - b.x) < b.sx / 2 && Math.abs(y - b.y) < b.sy / 2 && Math.abs(z - b.z) < b.sz / 2;
const solidAt = (x: number, y: number, z: number): boolean => plan.buildings.some((b) => b.boxes.some((box) => inside(box, x, y, z)));

describe('city plan', () => {
  it('is the same every time', () => {
    expect(JSON.stringify(buildCityPlan())).toBe(JSON.stringify(plan));
  });
  it('has buildings of every kind and a sensible count', () => {
    const kinds = new Set(plan.buildings.map((b) => b.kind));
    expect(kinds).toEqual(new Set(['low', 'mid', 'tower', 'bridge']));
    expect(plan.buildings.length).toBeGreaterThan(50);
    expect(plan.buildings.length).toBeLessThan(160);
  });
  it('keeps every building clear of the avenues', () => {
    const half = CITY.avenueWidthM / 2;
    for (const b of plan.buildings) {
      if (b.kind === 'bridge') continue;
      for (const c of [b.x - b.halfX, b.x + b.halfX]) expect(Math.abs(((c + 60) % 120) - 60) >= 0).toBe(true);
      for (const axis of [0, 120, -120, 240, -240]) {
        expect(b.x + b.halfX <= axis - half || b.x - b.halfX >= axis + half).toBe(true);
        expect(b.z + b.halfZ <= axis - half || b.z - b.halfZ >= axis + half).toBe(true);
      }
    }
  });
  it('no two buildings overlap on the ground (the bridge joins towers on purpose)', () => {
    const solid = plan.buildings.filter((b) => b.kind !== 'bridge');
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i];
        const b = solid[j];
        if (!a || !b) continue;
        const overlaps = Math.abs(a.x - b.x) < a.halfX + b.halfX - 0.01 && Math.abs(a.z - b.z) < a.halfZ + b.halfZ - 0.01;
        expect(overlaps).toBe(false);
      }
    }
  });
  it('leaves the plaza and the park free of towers', () => {
    const { blockCentersM: c, plazaBlock, parkBlock } = CITY;
    const px = c[plazaBlock.ix] ?? 0;
    const pz = c[plazaBlock.iz] ?? 0;
    const near = plan.buildings.filter((b) => Math.abs(b.x - px) < 46 && Math.abs(b.z - pz) < 46);
    expect(near.every((b) => b.kind === 'low')).toBe(true);
    const kx = c[parkBlock.ix] ?? 0;
    const kz = c[parkBlock.iz] ?? 0;
    expect(plan.buildings.some((b) => Math.abs(b.x - kx) < 46 && Math.abs(b.z - kz) < 46)).toBe(false);
  });
  it('every portal opening is clear air and the walls around it are solid', () => {
    const { portal } = CITY;
    const midY = portal.floorM + portal.heightM / 2;
    for (const p of CITY.portalLots) {
      expect(solidAt(p.x, midY, p.z)).toBe(false);
      const along = (d: number): [number, number] => (p.axis === 'z' ? [p.x, p.z + d] : [p.x + d, p.z]);
      for (const d of [-18, 0, 18]) expect(solidAt(along(d)[0], midY, along(d)[1])).toBe(false);
      const across = p.axis === 'z' ? [p.x + portal.widthM / 2 + 1, midY, p.z] : [p.x, midY, p.z + portal.widthM / 2 + 1];
      expect(solidAt(across[0] as number, across[1] as number, across[2] as number)).toBe(true);
      expect(solidAt(p.x, portal.floorM - 1, p.z)).toBe(true);
      expect(solidAt(p.x, portal.floorM + portal.heightM + 1, p.z)).toBe(true);
    }
  });
  it('the skybridge has open air under it', () => {
    const { skybridge } = CITY;
    expect(solidAt(0, skybridge.bottomY - 3, skybridge.z)).toBe(false);
    expect(solidAt(0, skybridge.bottomY + 2, skybridge.z)).toBe(true);
  });
});
