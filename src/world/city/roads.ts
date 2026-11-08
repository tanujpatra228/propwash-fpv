import { BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type Scene } from 'three';
import { CITY, WORLD } from '../../config';
import { createRng } from '../../core/math';

const CURB_M = 0.12;
const ROAD_COLOR = 0x35383d;
const SIDEWALK = 0x8a8a85;
const PLAZA = 0xa49d8e;
const PARK_GRASS = 0x4b7a2e;
const AVENUES = [-240, -120, 0, 120, 240] as const;

function asphaltTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#55585d';
    c.fillRect(0, 0, size, size);
    const rng = createRng(WORLD.seed + 3);
    for (let i = 0; i < 1400; i++) {
      const v = 100 + Math.floor(rng() * 60);
      c.fillStyle = `rgb(${v},${v},${v + 4})`;
      c.fillRect(rng() * size, rng() * size, 1.5, 1.5);
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(160, 160);
  return t;
}

/** Ground, curbs, sidewalks, the plaza and park lawn, lane markings and crosswalks. All flat; nothing here is solid. */
export function buildRoads(scene: Scene): void {
  // A huge dim plane to the horizon, and the city's asphalt on top of it.
  const horizon = new Mesh(new PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x59634f, roughness: 1 }));
  horizon.position.y = -0.3;
  horizon.receiveShadow = true;
  scene.add(horizon);
  const half = WORLD.bounds.halfSizeM + 40;
  const road = new Mesh(new PlaneGeometry(2 * half, 2 * half).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: asphaltTexture(), color: ROAD_COLOR, roughness: 0.9 }));
  road.position.y = -0.02;
  road.receiveShadow = true;
  scene.add(road);

  const { blockCentersM: centers, blockHalfM: bh, plazaBlock, parkBlock } = CITY;
  centers.forEach((bx, ix) => {
    centers.forEach((bz, iz) => {
      const isPark = ix === parkBlock.ix && iz === parkBlock.iz;
      const isPlaza = ix === plazaBlock.ix && iz === plazaBlock.iz;
      const color = isPark ? PARK_GRASS : isPlaza ? PLAZA : SIDEWALK;
      const slab = new Mesh(new BoxGeometry(2 * bh, CURB_M, 2 * bh), new MeshStandardMaterial({ color, roughness: isPark ? 1 : 0.85 }));
      slab.position.set(bx, CURB_M / 2 - 0.02, bz);
      slab.receiveShadow = true;
      scene.add(slab);
    });
  });
  // Outer ring of sidewalk beyond the last avenue, so the city does not end at an asphalt cliff.
  buildMarkings(scene);
  buildPond(scene);
}

function buildMarkings(scene: Scene): void {
  const dashes: Array<[number, number, boolean]> = []; // x, z, runs along z
  const limit = WORLD.bounds.halfSizeM - 20;
  for (const avenue of AVENUES) {
    for (let t = -limit; t <= limit; t += 9) {
      // Skip the intersections (an avenue crosses every other avenue every 120 m).
      const nearCross = AVENUES.some((a) => Math.abs(t - a) < CITY.avenueWidthM / 2 + 1);
      if (nearCross) continue;
      dashes.push([avenue, t, true], [t, avenue, false]);
    }
  }
  const geo = new BoxGeometry(0.22, 0.02, 3.2);
  const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.7 }), dashes.length);
  const o = new Object3D();
  dashes.forEach(([x, z, alongZ], i) => {
    o.position.set(x, 0.0, z);
    o.rotation.y = alongZ ? 0 : Math.PI / 2;
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Crosswalk stripes on the four arms of every intersection.
  const stripes: Matrix4[] = [];
  const arm = CITY.avenueWidthM / 2 + 2.5;
  for (const ax of AVENUES) {
    for (const az of AVENUES) {
      for (const side of [-1, 1]) {
        for (let k = -5; k <= 5; k++) {
          const m = new Matrix4();
          stripes.push(m.makeTranslation(ax + k * 2.2, 0.0, az + side * arm));
          const n = new Matrix4();
          stripes.push(n.makeTranslation(ax + side * arm, 0.0, az + k * 2.2));
        }
      }
    }
  }
  const stripeMesh = new InstancedMesh(new BoxGeometry(1.0, 0.02, 3), new MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.7 }), stripes.length);
  stripes.forEach((m, i) => {
    // Alternate which way the stripe faces so it reads on both arms: x-arms get short-wide, z-arms rotated.
    stripeMesh.setMatrixAt(i, m);
  });
  stripeMesh.instanceMatrix.needsUpdate = true;
  scene.add(stripeMesh);
}

/** The park pond, a flat translucent disc just above the lawn. Not solid and not a crash. */
function buildPond(scene: Scene): void {
  const { pond } = PARK;
  const mesh = new Mesh(
    new CylinderGeometry(pond.radiusM, pond.radiusM, 0.04, 48),
    new MeshStandardMaterial({ color: new Color(0x3f86a8), roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85, side: DoubleSide }),
  );
  mesh.position.set(pond.x, CURB_M + 0.03, pond.z);
  scene.add(mesh);
}

/** Park geometry shared by the lawn, pond and tree placement. */
export const PARK = (() => {
  const x = CITY.blockCentersM[CITY.parkBlock.ix] ?? 0;
  const z = CITY.blockCentersM[CITY.parkBlock.iz] ?? 0;
  return { x, z, halfM: CITY.blockHalfM, pond: { x: x - 8, z, radiusM: 16 } };
})();
