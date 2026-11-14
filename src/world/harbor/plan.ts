/**
 * Harbor Run's layout as plain data: where the land is, the container yard, the ship, the cranes and the warehouse.
 * Seeded and pure, so every player gets the same harbor and tests can check it. No scene, no DOM.
 */
import { HARBOR } from '../../config';
import { createRng } from '../../core/math';

export type SolidKind = 'container' | 'building' | 'crane';

/** An axis-aligned box: centre and full size, in metres. The mesh and the collider both come from these. */
export interface HarborBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  kind: SolidKind;
}

export interface YardBlock {
  x: number;
  z: number;
  levels: number;
  /** One colour per level, bottom first. */
  colors: number[];
}

export interface HarborPlan {
  /** Everything static and solid, once per object (a yard block is one box). */
  solids: HarborBox[];
  yardBlocks: YardBlock[];
}

/** True on the quay, the piers and the jetty; false on open water. */
export function isLand(x: number, z: number): boolean {
  return HARBOR.land.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
}

function box(x: number, yBottom: number, z: number, sx: number, yTop: number, sz: number, color: number, kind: SolidKind): HarborBox {
  return { x, y: (yBottom + yTop) / 2, z, sx, sy: yTop - yBottom, sz, color, kind };
}

/** A box from its extents: [x0, x1], [yBottom, yTop], [z0, z1]. */
function span(x0: number, x1: number, yBottom: number, yTop: number, z0: number, z1: number, color: number, kind: SolidKind): HarborBox {
  return box((x0 + x1) / 2, yBottom, (z0 + z1) / 2, x1 - x0, yTop, z1 - z0, color, kind);
}

function buildYard(): YardBlock[] {
  const rng = createRng(HARBOR.seed);
  const { yard } = HARBOR;
  const blocks: YardBlock[] = [];
  for (const z of yard.rowsZ) {
    for (let x = yard.firstX; x <= yard.lastX; x += yard.pitchX) {
      // Always draw from the generator so a skipped block never shifts the ones after it.
      const levelRoll = rng();
      const gapRoll = rng();
      const colorRolls = Array.from({ length: yard.maxLevels }, () => rng());
      const inAisle = yard.aislesX.some(([ax, half]) => Math.abs(x - ax) < half + yard.blockX / 2);
      const inTopAisle = Math.abs(z - yard.topAisle.z) < yard.topAisle.half + yard.blockZ / 2;
      if (inAisle || inTopAisle || gapRoll < 0.08) continue;
      const levels = yard.minLevels + Math.floor(levelRoll * (yard.maxLevels - yard.minLevels + 1));
      blocks.push({ x, z, levels, colors: colorRolls.slice(0, levels).map((r) => yard.colors[Math.floor(r * yard.colors.length)] ?? 0x888888) });
    }
  }
  return blocks;
}

function shipSolids(): HarborBox[] {
  const { ship } = HARBOR;
  const { cargo, tunnel, bridge } = ship;
  const half = tunnel.width / 2;
  return [
    span(ship.x0, ship.x1, -6, ship.hullHeightM, ship.z0, ship.z1, 0x2b3a4a, 'building'),
    // The cargo stack is built around its tunnel: a wall each side, a slab over it and a slab under it.
    span(cargo.x0, cargo.x1, ship.hullHeightM, cargo.top, cargo.z0, tunnel.z - half, 0x8a3a2a, 'container'),
    span(cargo.x0, cargo.x1, ship.hullHeightM, cargo.top, tunnel.z + half, cargo.z1, 0x2f5d7a, 'container'),
    span(cargo.x0, cargo.x1, tunnel.y1, cargo.top, tunnel.z - half, tunnel.z + half, 0x3c6a3c, 'container'),
    span(cargo.x0, cargo.x1, ship.hullHeightM, tunnel.y0, tunnel.z - half, tunnel.z + half, 0xa7752e, 'container'),
    span(bridge.x0, bridge.x1, ship.hullHeightM, bridge.top, bridge.z0, bridge.z1, 0xd9d9d2, 'building'),
  ];
}

/** The static parts of a gantry crane at `x`: four legs, two cross beams over the gap and the boom along z. */
export function craneSolids(x: number): HarborBox[] {
  const { crane, quayY } = { crane: HARBOR.crane, quayY: HARBOR.quayY };
  const g = crane.halfGapX;
  const s = crane.legSizeM / 2;
  const top = crane.boomY + 1;
  const color = 0xd9892b;
  const parts: HarborBox[] = [];
  for (const z of crane.legZ) {
    for (const side of [-1, 1]) parts.push(span(x + side * g - s, x + side * g + s, quayY, top, z - s, z + s, color, 'crane'));
    parts.push(span(x - g, x + g, crane.boomY - 1, top, z - s, z + s, color, 'crane'));
  }
  parts.push(span(x - 1, x + 1, crane.boomY - 1, top, crane.boomZ[0], crane.boomZ[1], color, 'crane'));
  return parts;
}

function warehouseSolids(): HarborBox[] {
  const w = HARBOR.warehouse;
  const half = w.tunnel.widthM / 2;
  const top = HARBOR.quayY + w.tunnel.heightM;
  const color = 0xb9b2a4;
  return [
    span(w.x0, w.x1, HARBOR.quayY, w.heightM, w.z0, w.tunnel.z - half, color, 'building'),
    span(w.x0, w.x1, HARBOR.quayY, w.heightM, w.tunnel.z + half, w.z1, color, 'building'),
    span(w.x0, w.x1, top, w.heightM, w.tunnel.z - half, w.tunnel.z + half, color, 'building'),
  ];
}

export function buildHarborPlan(): HarborPlan {
  const yardBlocks = buildYard();
  const { yard } = HARBOR;
  const solids: HarborBox[] = yardBlocks.map((b) => box(b.x, HARBOR.quayY, b.z, yard.blockX, HARBOR.quayY + b.levels * yard.levelM, yard.blockZ, b.colors[0] ?? 0x888888, 'container'));
  solids.push(...shipSolids(), ...warehouseSolids());
  for (const c of HARBOR.cranes) solids.push(...craneSolids(c.x));
  for (const [x0, x1, z0, z1] of HARBOR.breakwater) solids.push(span(x0, x1, -2, 5, z0, z1, 0x77736b, 'building'));
  return { solids, yardBlocks };
}

export interface CraneState {
  trolleyZ: number;
  /** Centre of the hanging container along z. */
  containerZ: number;
}

/** Where a crane's trolley is at `timeS`: a smooth back and forth along the boom. Pure. */
export function craneState(phaseS: number, timeS: number, out: CraneState): CraneState {
  const { crane } = HARBOR;
  const z = crane.centreZ + crane.amplitudeM * Math.sin(((timeS + phaseS) / crane.periodS) * Math.PI * 2);
  out.trolleyZ = z;
  out.containerZ = z;
  return out;
}
