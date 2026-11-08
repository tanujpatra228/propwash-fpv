/**
 * The city's layout as plain data: which buildings stand where, how tall, and where the tunnels ("windows") run.
 * Seeded and pure, so every player gets the same city and tests can check it. No scene, no DOM.
 */
import { CITY } from '../../config';
import { createRng, randRange } from '../../core/math';

export type BuildingKind = 'low' | 'mid' | 'tower' | 'bridge';

/** An axis-aligned box: centre and full size, in metres. Both the mesh and the collider come from these. */
export interface CityBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  tint: number;
}

export interface CityBuilding {
  kind: BuildingKind;
  /** The footprint centre and half-size, for overlap checks. */
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  heightM: number;
  hasPortal: boolean;
  boxes: CityBox[];
}

export interface CityPlan {
  buildings: CityBuilding[];
}

const { lotHalfM: HALF, lotOffsetM: OFFSET, portal } = CITY;

function box(x: number, yBottom: number, z: number, sx: number, yTop: number, sz: number, tint: number): CityBox {
  return { x, y: (yBottom + yTop) / 2, z, sx, sy: yTop - yBottom, sz, tint };
}

/** A lot-sized building with a rectangular tunnel straight through it along `axis`, built from boxes around the opening. */
function portalBuilding(x: number, z: number, axis: 'x' | 'z', heightM: number, tint: number): CityBuilding {
  const pw = portal.widthM / 2;
  const floorY = portal.floorM;
  const topY = portal.floorM + portal.heightM;
  const side = (HALF + pw) / 2; // centre of a side wall, measured from the lot centre
  const wall = HALF - pw;
  const boxes: CityBox[] =
    axis === 'z'
      ? [
          box(x - side, 0, z, wall, heightM, 2 * HALF, tint),
          box(x + side, 0, z, wall, heightM, 2 * HALF, tint),
          box(x, 0, z, portal.widthM, floorY, 2 * HALF, tint),
          box(x, topY, z, portal.widthM, heightM, 2 * HALF, tint),
        ]
      : [
          box(x, 0, z - side, 2 * HALF, heightM, wall, tint),
          box(x, 0, z + side, 2 * HALF, heightM, wall, tint),
          box(x, 0, z, 2 * HALF, floorY, portal.widthM, tint),
          box(x, topY, z, 2 * HALF, heightM, portal.widthM, tint),
        ];
  return { kind: 'tower', x, z, halfX: HALF, halfZ: HALF, heightM, hasPortal: true, boxes };
}

function plainBuilding(x: number, z: number, kind: Exclude<BuildingKind, 'bridge'>, heightM: number, rng: () => number): CityBuilding {
  const tint = CITY.tints[Math.floor(rng() * CITY.tints.length)] ?? 0xcccccc;
  // Narrower than the lot by a random margin so the skyline is not a wall of identical blocks.
  const inset = randRange(rng, 0, 4);
  const halfX = HALF - inset * rng();
  const halfZ = HALF - inset * rng();
  const boxes: CityBox[] =
    kind === 'tower' && heightM > 85
      ? [box(x, 0, z, 2 * halfX, heightM * 0.72, 2 * halfZ, tint), box(x, heightM * 0.72, z, 2 * halfX * 0.62, heightM, 2 * halfZ * 0.62, tint)]
      : [box(x, 0, z, 2 * halfX, heightM, 2 * halfZ, tint)];
  return { kind, x, z, halfX, halfZ, heightM, hasPortal: false, boxes };
}

function isLot(list: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean {
  return list.some(([lx, lz]) => Math.abs(lx - x) < 1 && Math.abs(lz - z) < 1);
}

/** Builds the whole city. Deterministic. */
export function buildCityPlan(): CityPlan {
  const rng = createRng(CITY.seed);
  const buildings: CityBuilding[] = [];
  const { blockCentersM: centers, plazaBlock, parkBlock } = CITY;
  centers.forEach((bx, ix) => {
    centers.forEach((bz, iz) => {
      const isPlaza = ix === plazaBlock.ix && iz === plazaBlock.iz;
      const isPark = ix === parkBlock.ix && iz === parkBlock.iz;
      for (const dz of [-1, 1]) {
        for (const dx of [-1, 1]) {
          const x = bx + dx * OFFSET;
          const z = bz + dz * OFFSET;
          // Always draw from the generator, so a forced lot never shifts the lots after it.
          const roll = rng();
          const heightRoll = rng();
          const tintRoll = rng();
          if (isPark) continue;
          const portalLot = CITY.portalLots.find((p) => Math.abs(p.x - x) < 1 && Math.abs(p.z - z) < 1);
          if (portalLot) {
            buildings.push(portalBuilding(x, z, portalLot.axis, CITY.portalLotHeightM, CITY.tints[Math.floor(tintRoll * CITY.tints.length)] ?? 0xcccccc));
            continue;
          }
          if (isLot(CITY.bridgeTowerLots, x, z)) {
            buildings.push(plainBuilding(x, z, 'tower', CITY.bridgeTowerHeightM, createRng(CITY.seed + ix * 31 + iz * 7 + dx + dz * 3)));
            continue;
          }
          // The plaza keeps only low pavilions, so the start straight is open.
          const kind = isPlaza ? 'low' : roll < CITY.towerChance ? 'tower' : roll < CITY.towerChance + CITY.midChance ? 'mid' : 'low';
          const [min, max] = CITY.height[kind];
          buildings.push(plainBuilding(x, z, kind, min + heightRoll * (max - min), createRng(Math.floor(tintRoll * 1e9))));
        }
      }
    });
  });
  buildings.push(skybridge());
  return { buildings };
}

/** A covered glass bridge hung between the two bridge towers, with open air under it. */
function skybridge(): CityBuilding {
  const { z, bottomY, depthM, heightM } = CITY.skybridge;
  const width = 2 * HALF + 2; // 1 m into each tower so there is no gap
  return {
    kind: 'bridge',
    x: 0,
    z,
    halfX: width / 2,
    halfZ: depthM / 2,
    heightM: bottomY + heightM,
    hasPortal: false,
    boxes: [box(0, bottomY, z, width, bottomY + heightM, depthM, 0x9fd0e6)],
  };
}
