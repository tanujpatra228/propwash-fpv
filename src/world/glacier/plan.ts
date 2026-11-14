/** The glacier's solid things as plain data: the rock arch, the ski lodge and the pines. Seeded and pure. */
import { GLACIER } from '../../config';
import { createRng, randRange } from '../../core/math';
import { glacierHeight, routeInfo, type RouteInfo } from './terrain-fn';

export type GlacierKind = 'rock' | 'building';

export interface GlacierBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  kind: GlacierKind;
}

export interface Pine {
  x: number;
  z: number;
  baseY: number;
  scale: number;
}

export interface GlacierPlan {
  solids: GlacierBox[];
  pines: Pine[];
}

function span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, kind: GlacierKind): GlacierBox {
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, color, kind };
}

/** Two pillars and a lintel across the valley, standing on the valley floor. */
function archSolids(): GlacierBox[] {
  const { arch } = GLACIER;
  const floor = glacierHeight(arch.x, arch.z);
  const half = arch.depthM / 2;
  const rock = 0x8a8a88;
  const pillar = (side: number): GlacierBox => {
    const x0 = arch.x + side * arch.pillarX - arch.pillarWidthM / 2;
    return span(x0, x0 + arch.pillarWidthM, floor - 4, floor + arch.lintelTopM, arch.z - half, arch.z + half, rock, 'rock');
  };
  const lintel = span(arch.x - arch.pillarX - arch.pillarWidthM / 2, arch.x + arch.pillarX + arch.pillarWidthM / 2, floor + arch.lintelBottomM, floor + arch.lintelTopM, arch.z - half - 1, arch.z + half + 1, 0xa9a9a6, 'rock');
  return [pillar(-1), pillar(1), lintel];
}

/** The lodge: log walls and a flat snowy roof slab. */
function lodgeSolids(): GlacierBox[] {
  const l = GLACIER.lodge;
  const floor = glacierHeight(l.x, l.z);
  return [
    span(l.x - l.widthM / 2, l.x + l.widthM / 2, floor - 1, floor + l.wallHeightM, l.z - l.depthM / 2, l.z + l.depthM / 2, 0x6e4a30, 'building'),
    span(l.x - l.widthM / 2 - 1.5, l.x + l.widthM / 2 + 1.5, floor + l.wallHeightM, floor + l.wallHeightM + l.roofHeightM * 0.5, l.z - l.depthM / 2 - 1.5, l.z + l.depthM / 2 + 1.5, 0xe9eef2, 'building'),
  ];
}

function placePines(): Pine[] {
  const rng = createRng(GLACIER.seed);
  const { pines } = GLACIER;
  const info: RouteInfo = { distanceM: 0, floorY: 0, halfWidthM: 0 };
  const out: Pine[] = [];
  const lodge = GLACIER.lodge;
  for (let attempts = 0; out.length < pines.count && attempts < pines.count * 40; attempts++) {
    const x = randRange(rng, -pines.areaHalfM, pines.areaHalfM);
    const z = randRange(rng, -pines.areaHalfM, pines.areaHalfM);
    const scale = randRange(rng, 0.8, 1.5);
    const y = glacierHeight(x, z);
    if (y > pines.maxHeightM) continue;
    routeInfo(x, z, info);
    // On the slopes beside the floor, never on the race floor itself, the lake, or too steep.
    if (info.distanceM < info.halfWidthM + pines.minGapFromFloorM || info.halfWidthM >= GLACIER.lake.minHalfWidthM) continue;
    const slope = Math.hypot(glacierHeight(x + 2, z) - y, glacierHeight(x, z + 2) - y) / 2;
    if (slope > 0.55) continue;
    if (Math.hypot(x - lodge.x, z - lodge.z) < 30 || Math.hypot(x - GLACIER.arch.x, z - GLACIER.arch.z) < 20) continue;
    out.push({ x, z, baseY: y, scale });
  }
  return out;
}

export function buildGlacierPlan(): GlacierPlan {
  return { solids: [...archSolids(), ...lodgeSolids()], pines: placePines() };
}
