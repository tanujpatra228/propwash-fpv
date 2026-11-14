import { describe, expect, it } from 'vitest';
import { HARBOR } from '../../config';
import { buildHarborPlan, craneSolids, craneState, isLand, type CraneState, type HarborBox } from './plan';

const plan = buildHarborPlan();
const inside = (b: HarborBox, x: number, y: number, z: number): boolean =>
  Math.abs(x - b.x) < b.sx / 2 && Math.abs(y - b.y) < b.sy / 2 && Math.abs(z - b.z) < b.sz / 2;
const solidAt = (x: number, y: number, z: number): boolean => plan.solids.some((b) => inside(b, x, y, z));

describe('harbor plan', () => {
  it('is the same every time', () => {
    expect(JSON.stringify(buildHarborPlan())).toBe(JSON.stringify(plan));
  });
  it('has a yard of blocks, a ship, two cranes and a warehouse', () => {
    expect(plan.yardBlocks.length).toBeGreaterThan(120);
    expect(plan.yardBlocks.length).toBeLessThan(260);
    expect(plan.solids.length).toBeGreaterThan(plan.yardBlocks.length + 10);
  });
  it('knows land from water', () => {
    expect(isLand(-232, -128)).toBe(true); // the start, on the quay
    expect(isLand(170, 40)).toBe(true); // the east pier
    expect(isLand(-170, -30)).toBe(true); // the west pier
    expect(isLand(-240, -110)).toBe(true); // the jetty by the start
    expect(isLand(0, 0)).toBe(false); // open water
    expect(isLand(-100, -40)).toBe(false);
  });
  it('keeps the aisles and the quay lane clear of yard blocks', () => {
    for (const b of plan.yardBlocks) {
      for (const [ax, half] of HARBOR.yard.aislesX) expect(Math.abs(b.x - ax) >= half + HARBOR.yard.blockX / 2).toBe(true);
      expect(b.z).toBeLessThan(-140);
    }
  });
  it('the ship tunnel is open air with solid cargo above, below and either side', () => {
    const { tunnel, cargo } = HARBOR.ship;
    const mid = (tunnel.y0 + tunnel.y1) / 2;
    for (const x of [cargo.x0 + 1, 0, cargo.x1 - 1]) expect(solidAt(x, mid, tunnel.z)).toBe(false);
    expect(solidAt(0, mid, tunnel.z + tunnel.width / 2 + 1)).toBe(true);
    expect(solidAt(0, mid, tunnel.z - tunnel.width / 2 - 1)).toBe(true);
    expect(solidAt(0, tunnel.y1 + 1, tunnel.z)).toBe(true);
    expect(solidAt(0, tunnel.y0 - 1, tunnel.z)).toBe(true);
  });
  it('the warehouse tunnel is open air, solid either side and overhead', () => {
    const w = HARBOR.warehouse;
    const mid = HARBOR.quayY + w.tunnel.heightM / 2;
    for (const x of [w.x0 + 1, (w.x0 + w.x1) / 2, w.x1 - 1]) expect(solidAt(x, mid, w.tunnel.z)).toBe(false);
    expect(solidAt((w.x0 + w.x1) / 2, mid, w.tunnel.z + w.tunnel.widthM / 2 + 1)).toBe(true);
    expect(solidAt((w.x0 + w.x1) / 2, HARBOR.quayY + w.tunnel.heightM + 1, w.tunnel.z)).toBe(true);
  });
  it('leaves a clear gap between the crane legs for the route to pass', () => {
    const parts = craneSolids(0);
    const mid = 8;
    expect(parts.some((b) => inside(b, 0, mid, HARBOR.crane.legZ[0]))).toBe(false);
    expect(parts.some((b) => inside(b, 0, mid, (HARBOR.crane.legZ[0] + HARBOR.crane.legZ[1]) / 2))).toBe(false);
  });
});

describe('crane timing', () => {
  const state: CraneState = { trolleyZ: 0, containerZ: 0 };
  const half = HARBOR.crane.container.lengthM / 2 + 1; // container half length plus a drone's safety margin
  const blockedAt = (phaseS: number, t: number): boolean => Math.abs(craneState(phaseS, t, state).containerZ - HARBOR.crane.centreZ) < half;

  it('blocks the route under a third of the time, for no more than 3 seconds at once', () => {
    for (const crane of HARBOR.cranes) {
      let blocked = 0;
      let run = 0;
      let longest = 0;
      const step = 0.05;
      for (let t = 0; t < HARBOR.crane.periodS * 4; t += step) {
        if (blockedAt(crane.phaseS, t)) {
          blocked += step;
          run += step;
          longest = Math.max(longest, run);
        } else run = 0;
      }
      expect(blocked / (HARBOR.crane.periodS * 4)).toBeLessThan(0.3);
      expect(longest).toBeLessThan(3);
    }
  });
  it('the trolley stays within the boom', () => {
    for (let t = 0; t < 30; t += 0.5) {
      const z = craneState(0, t, state).trolleyZ;
      expect(z).toBeGreaterThanOrEqual(HARBOR.crane.boomZ[0]);
      expect(z).toBeLessThanOrEqual(HARBOR.crane.boomZ[1]);
    }
  });
});
